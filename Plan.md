# 打印店自然语言接单 Agent — Plan

Status: implemented. See README.md for commands, configuration, and verified offline/live results. The sections below preserve the original implementation specification.

## 1. Goal and billing rules

Turn a Chinese natural-language print order into an auditable quotation using these rules from the picture:

- Layout quantity = unique source pages requiring layout, charged once regardless of copies.
- Printing quantity = sum of source pages × copies for each section.
- Binding quantity = requested number of books, independent of print copies.
- Load unit prices through `getPriceList()` from the external configuration in section 3.
- Each quote shows quantities, unit prices, subtotals, total, currency, and the price version/effective time used. Disclose applied defaults.

For the five demos, omitted copies default to one and omitted layout requirements default to all source pages. “只要打印” disables layout; “不要装订” sets binding to zero. Case-specific interpretations appear only in section 4.

Use integer fen for arithmetic and display yuan to two decimal places. Validate quantities, rates, and arithmetic results as safe integers. Ask for clarification when required order details are unresolved.

## 2. Stack and application flow

Use Node.js + TypeScript with ESM, strict type checking, npm, and a committed lockfile. Select compatible dependency versions and a supported Node.js LTS release during implementation.

| Library | Responsibility |
| --- | --- |
| [Commander](https://github.com/tj/commander.js) | CLI arguments and help |
| [Zod](https://zod.dev/) | Runtime schemas and inferred TypeScript types |
| [dotenv](https://github.com/motdotla/dotenv) | Local environment loading; process environment takes precedence |
| [`@langchain/deepseek`, `@langchain/core`](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek) | DeepSeek access and structured order extraction |
| [Vitest](https://vitest.dev/guide/) | The five demo tests |
| TypeScript, `@types/node`, [tsx](https://github.com/privatenumber/tsx) | Type checking, compilation, and development execution |

Flow: customer text → LangChain structured extraction → validated order → one price snapshot → deterministic billing → itemized quote.

The model extracts order facts; application code calculates the bill. Use library timeout/retry support and small functions rather than custom framework layers. Use Node's built-in file loading and readline support where needed.

Environment settings:

| Setting | Value / purpose |
| --- | --- |
| `API_KEY` | User's DeepSeek key; local `.env` is ignored by Git |
| `MODEL` | User-selected DeepSeek model |
| `BASE_URL` | Default `https://api.deepseek.com` |
| `PRICE_LIST_PATH` | Default `config/prices.json` |
| `RUN_LIVE_TESTS` | Explicit process-environment opt-in for the live mode in section 4 |

Small extraction example (settings and `OrderSchema` will be defined by the application):

```ts
import { ChatDeepSeek } from "@langchain/deepseek";

const model = new ChatDeepSeek({
  apiKey: settings.API_KEY,
  model: settings.MODEL,
  configuration: { baseURL: settings.BASE_URL },
});
const extractor = model.withStructuredOutput(OrderSchema, { method: "jsonMode" });
```

Verify that the selected model supports the extraction method. For JSON mode, include JSON instructions and the desired format in the prompt, and validate the result with Zod. See [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/).

## 3. Price configuration

Planned `config/prices.json`, using the picture's reference prices:

```json
{
  "version": "demo-v1",
  "effective_at": "2026-10-31T00:00:00+08:00",
  "currency": "CNY",
  "layout_per_source_page_fen": 300,
  "print_per_page_fen": 50,
  "binding_per_book_fen": 2000
}
```

`getPriceList()` reads and validates this replaceable file. Use one snapshot for all lines of a quote and preserve its pricing metadata. Missing or invalid configuration returns an error without a fabricated bill.

## 4. Five demo test cases

This table is the single specification for the five fixtures. Amounts are expected CNY values using section 3's prices; they are not executed results.

| ID | Input from the picture | Layout pages | Printed pages | Books | Layout subtotal | Print subtotal | Binding subtotal | Total |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| D1 | 帮我打一份合同，一共 10 页，装订成 1 本。 | 10 | 10 | 1 | 30.00 | 5.00 | 20.00 | **55.00** |
| D2 | PPT 共 20 页，每页打 3 份，装成 2 册。 | 20 | 60 | 2 | 60.00 | 30.00 | 40.00 | **130.00** |
| D3 | 论文 80 页打印份，装订一本。 | 80 | 80 | 1 | 240.00 | 40.00 | 20.00 | **300.00** |
| D4 | 只要打印，不要装订：手册 15 页，印 1 份。 | 0 | 15 | 0 | 0.00 | 7.50 | 0.00 | **7.50** |
| D5 | 封面和目录各 1 页、正文 30 页，正文打 2 份，封面目录各打 1 份，装 1 本，封面目录也需要排版。 | 32 | 62 | 1 | 96.00 | 31.00 | 20.00 | **147.00** |

Case interpretations:

- **D3:** The picture's wording is ambiguous. The expected quote assumes 80 source pages, one copy each, and layout. Record confirmation of this interpretation in the fixture.
- **D5:** Cover and contents are distinct one-page sources, each printed once; body layout follows the default. Bind one book without changing the requested print quantities. Page allocation within that book is a production detail to clarify if needed.

Use one Vitest suite and one shared fixture set for D1–D5. Each fixture contains the input, normalized order, any clarification, and expected quote fields from the table. A shared assertion checks all quantities, unit prices, subtotals, total, and pricing metadata.

The suite has two execution modes over the same fixtures:

- **Default offline:** inject the fixture's normalized extraction result, then exercise the quotation flow without a key or network.
- **Explicit live:** when `process.env.RUN_LIVE_TESTS === "true"`, load DeepSeek settings and extract from the fixture's original text and recorded clarification before applying the same assertions. This checks model comprehension as well as billing.

Illustrative test structure; helper functions will be implemented later:

```ts
import { expect, test } from "vitest";

// demoCases is loaded from the single shared fixture set.
test.each(demoCases)("$id", async (demo) => {
  const quote = await runDemo(demo, {
    live: process.env.RUN_LIVE_TESTS === "true",
  });
  expect(quote).toMatchObject(demo.expectedQuote);
});
```

Planned npm scripts:

```json
{
  "dev": "tsx src/cli.ts",
  "build": "tsc -p tsconfig.build.json",
  "start": "node dist/cli.js",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

`npm test` runs offline by default. To run the same suite against DeepSeek, set `RUN_LIVE_TESTS=true` in the process environment; the suite checks this flag before loading `.env`. Compilation targets `src/` into `dist/`; type checking also includes tests.

## 5. Planned repository structure

```text
Codes/
├── Plan.md
├── README.md
├── .env                       # local credentials, ignored by Git
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── .node-version
├── tsconfig.json
├── tsconfig.build.json
├── config/
│   └── prices.json
├── src/
│   ├── cli.ts                 # settings, Commander entry point, output
│   ├── schemas.ts             # Zod schemas and inferred types
│   ├── parser.ts              # ChatDeepSeek extraction
│   ├── pricing.ts             # external price loading
│   └── quote.ts               # billing functions
└── tests/
    ├── fixtures/demos.json    # D1–D5 inputs and expectations
    └── demos.test.ts          # shared offline/live suite
```

This is the implementation target. The current repository contains documentation, environment templates, and directory placeholders. Combine modules when a separate file adds no value. The eventual README explains startup and testing.

## 6. Completion criteria

1. All five picture cases pass with the specified quote breakdowns and totals.
2. Keep custom code small and focused on printing rules; reuse the selected open-source libraries and avoid unnecessary abstractions.
