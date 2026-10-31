# 打印店自然语言接单 Agent

中文自然语言打印订单 → DeepSeek 结构化提取 → 数量校验 → 读取一份外部价目表快照 → 输出人民币报价明细。所有计费均使用安全整数，以“分”为单位计算；模型只提取订单信息，不计算价格。

## 安装与运行

使用 Node.js 22 LTS（已在 22.22.0 上验证，见 `.node-version`）和 npm。在本项目目录下运行：

```powershell
npm ci
# 仅在 .env 文件不存在时执行：
Copy-Item .env.example .env
```

在已被 Git 忽略的 `.env` 文件中设置 `API_KEY` 和 `MODEL`。`MODEL=deepseek-chat` 已通过真实的 JSON 模式 API 调用验证。`BASE_URL` 默认为 `https://api.deepseek.com`；`PRICE_LIST_PATH` 默认为 `config/prices.json`。进程环境变量的优先级高于 `.env`。客户端的单次请求超时为 60 秒，由所用库最多重试两次。其他模型或接口地址需要支持 JSON 输出。

```powershell
npm run dev -- "帮我打一份合同，一共 10 页，装订成 1 本。"
npm run build
npm start -- "只要打印，不要装订：手册 15 页，印 1 份。"
npm start -- "论文80 页打两份，各装订一本。" --json
```

输出示例：

```text
报价 CNY | 价目表 demo-v1 | 生效 2026-10-31T00:00:00+08:00
排版（源页）：0 × ¥3.00 = ¥0.00
打印（页）：15 × ¥0.50 = ¥7.50
装订（本）：0 × ¥20.00 = ¥0.00
合计：¥7.50
```

使用 `--prices path/to/prices.json` 指定其他价目表文件。`--json` 输出包含标准化后的来源信息、订单原文、补充确认、采用的默认值，以及价目表元数据。在交互式终端中，程序会追问尚未明确的信息；使用 `--no-interactive` 或重定向输入时，程序会输出待确认的问题，并以退出码 1 结束。交互时输入空行会取消报价。价目表缺失或无效、订单提取失败时，程序会报错，不会生成报价。

## 计费规则

- 排版按不同来源的原始页数计费，同一源页只收费一次，与打印份数无关。每个来源只对应一个分项，重复打印的份数记录在该分项的 `copies` 字段中。
- 打印数量按各分项的“源页数 × 份数”求和。装订数量按用户明确要求的本数计算。
- 未注明份数时默认打印一份；未注明排版范围时默认全部源页需要排版。输出会注明采用的默认值。“只要打印”表示不排版；“不要装订”表示装订本数为零。
- 缺少页数、装订要求不明确、指令矛盾或表述残缺时，需要补充确认。第 3 个示例（D3）明确要求打印两份、各装订一本，因此无需追问：排版 80 页、打印 160 页、装订 2 本。
- 封面、目录和正文分别作为独立来源。第 5 个示例（D5）装订一本，同时保留各部分要求的打印数量；实际生产时的书内页面分配不改变报价。

价目表为可替换的 JSON 文件，包含版本号、ISO 格式的生效时间、币种 CNY，以及以“分”为单位的非负整数单价。每次报价读取一份快照；报价中的元数据用于记录本次使用的价目表，程序不会自动按历史时间选择价格。

## 测试

```powershell
npm run typecheck
npm test
npm run build

# 显式启用真实 API 测试，会产生 API 用量：
$env:RUN_LIVE_TESTS = 'true'
npm test -- --reporter=verbose
Remove-Item Env:RUN_LIVE_TESTS
```

`tests/fixtures/demos.json` 保存 D1–D5 共用的测试数据，包括订单原文、标准化提取结果、可选的补充确认，以及各项预期报价。这五个示例均不需要额外补充确认。离线模式直接注入标准化提取结果，验证报价流程，无需密钥，也不调用 API。真实 API 模式将订单原文发送给 DeepSeek，再执行同样的断言，包括各分项数量和默认值披露检查。只有在进程环境中设置 `RUN_LIVE_TESTS=true` 才会启用真实 API 模式，在 `.env` 中设置不会启用。测试配置会保留 API 的 `BASE_URL`，避免 Vite 将同名变量设置为它自己的资源地址。

两种模式均已验证以下总价：D1 ¥55.00、D2 ¥130.00、D3 ¥360.00、D4 ¥7.50、D5 ¥147.00。额外测试覆盖信息未明确、来源重复、数量或单价无效、配置缺失和算术溢出。模型提取具有不确定性；这些用例用于回归验证，不能保证任意表述都能正确识别。

实现参考：[LangChain ChatDeepSeek](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek)、[DeepSeek JSON 输出](https://api-docs.deepseek.com/guides/json_mode/)和 [Node.js 支持周期](https://github.com/nodejs/Release)。
