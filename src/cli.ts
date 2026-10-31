import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createExtractor } from "./parser.js";
import { ClarificationRequired, formatQuote, quoteOrder } from "./quote.js";

const program = new Command()
  .name("print-quote")
  .description("中文自然语言打印订单报价")
  .argument("<order>", "订单原文")
  .option("--clarification <text...>", "补充确认信息")
  .option("--prices <path>", "价目表 JSON 文件")
  .option("--json", "输出 JSON 报价")
  .option("--no-interactive", "遇到歧义时输出问题并退出")
  .action(async (order: string, options: { clarification?: string[]; prices?: string; json?: boolean; interactive: boolean }) => {
    const extract = createExtractor();
    const clarifications = [...(options.clarification ?? [])];
    for (;;) {
      try {
        const quote = await quoteOrder(order, { extract, clarifications, pricePath: options.prices });
        console.log(options.json ? JSON.stringify({ ...quote, input: order, clarifications }, null, 2) : formatQuote(quote));
        return;
      } catch (error) {
        if (!(error instanceof ClarificationRequired)) throw error;
        if (!options.interactive || !stdin.isTTY) throw error;
        const reader = createInterface({ input: stdin, output: options.json ? process.stderr : stdout });
        try {
          const answer = await reader.question(`${error.message}\n请补充（空行取消）：`);
          if (!answer.trim()) throw new Error("报价已取消。");
          clarifications.push(answer);
        } finally { reader.close(); }
      }
    }
  });

try { await program.parseAsync(); }
catch (error) {
  console.error(error instanceof Error ? error.message : "报价失败。");
  process.exitCode = 1;
}
