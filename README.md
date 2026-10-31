# 打印店自然语言接单 Agent

Chinese natural-language print orders → DeepSeek structured extraction → validated quantities → one external price snapshot → an itemized CNY quote. All billing uses safe integer fen; the model never calculates prices.

## Setup

Use Node.js 22 LTS (tested with 22.22.0; see `.node-version`) and npm. Run commands from this directory:

```powershell
npm ci
# Only if .env does not already exist:
Copy-Item .env.example .env
```

Set `API_KEY` and `MODEL` in the ignored `.env`. `MODEL=deepseek-chat` was verified with real JSON-mode calls. `BASE_URL` defaults to `https://api.deepseek.com`; `PRICE_LIST_PATH` defaults to `config/prices.json`. Process environment takes precedence over `.env`. The client has a 60-second request timeout and up to two library retries. Other models/endpoints must support JSON output.

```powershell
npm run dev -- "帮我打一份合同，一共 10 页，装订成 1 本。"
npm run build
npm start -- "只要打印，不要装订：手册 15 页，印 1 份。"
npm start -- "论文80 页打两份，各装订一本。" --json
```

Example output:

```text
报价 CNY | 价目表 demo-v1 | 生效 2026-10-31T00:00:00+08:00
排版（源页）：0 × ¥3.00 = ¥0.00
打印（页）：15 × ¥0.50 = ¥7.50
装订（本）：0 × ¥20.00 = ¥0.00
合计：¥7.50
```

Use `--prices path/to/prices.json` for a different price file. `--json` includes normalized sources, original text, confirmations, defaults, and pricing metadata. Interactive terminals ask follow-up questions; `--no-interactive` or redirected input reports questions and exits with code 1. Empty interactive answers cancel. Missing or invalid prices and extraction failures produce an error without a bill.

## Billing rules

- Layout is charged once per unique source page, independent of copies. Each source appears in one section; repeated copies belong in its `copies` field.
- Printing is source pages × copies, summed across sections. Binding is the explicitly requested number of books.
- Omitted copies default to one; omitted layout scope defaults to all source pages. Applied defaults appear in output. “只要打印” disables layout; “不要装订” sets books to zero.
- Missing page counts, unknown binding requirements, conflicting instructions, or incomplete wording require clarification. D3 explicitly requests two copies, each bound as one book, so it needs no clarification: 80 layout pages, 160 printed pages, and two books.
- Cover, contents, and body are separate sources. D5 binds one book while preserving requested section quantities; production page allocation does not change its bill.

Prices are replaceable JSON with a version, ISO effective time, CNY currency, and nonnegative integer-fen rates. Each quote reads one snapshot; metadata describes that snapshot rather than selecting a historical price automatically.

## Tests

```powershell
npm run typecheck
npm test
npm run build

# Explicit real API test; incurs API usage:
$env:RUN_LIVE_TESTS = 'true'
npm test -- --reporter=verbose
Remove-Item Env:RUN_LIVE_TESTS
```

`tests/fixtures/demos.json` is the shared D1–D5 fixture set, including original text, normalized extraction, optional clarification, and every expected quote line. None of these five examples requires added clarification. Offline mode injects normalized extraction and exercises the quotation flow without credentials or API calls. Live mode invokes DeepSeek with original text, then applies the same assertions, including section quantities and default disclosures. Only `RUN_LIVE_TESTS=true` in the process environment enables live mode; `.env` cannot opt in. Test configuration preserves the API `BASE_URL` because Vite otherwise assigns that name its own asset URL.

Verified in both modes: D1 ¥55.00, D2 ¥130.00, D3 ¥360.00, D4 ¥7.50, D5 ¥147.00. Additional tests check unresolved details, duplicate sources, invalid quantities/rates, missing configuration, and arithmetic overflow. Model extraction is probabilistic; passing fixtures is a regression check, not a guarantee for arbitrary wording.

Implementation references: [LangChain ChatDeepSeek](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek), [DeepSeek JSON output](https://api-docs.deepseek.com/guides/json_mode/), and [Node.js support schedule](https://github.com/nodejs/Release).
