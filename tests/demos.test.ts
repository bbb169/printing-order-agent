import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { createExtractor } from "../src/parser.js";
import { calculateQuote, ClarificationRequired, normalizeOrder, quoteOrder, yuan } from "../src/quote.js";
import { OrderSchema } from "../src/schemas.js";
import { getPriceList } from "../src/pricing.js";

// Capture the explicit process flag BEFORE dotenv is allowed to load.
const live = process.env.RUN_LIVE_TESTS === "true";
const extract = live ? createExtractor() : undefined;
const demos = JSON.parse(await readFile(new URL("./fixtures/demos.json", import.meta.url), "utf8")) as Array<{
  id: string; input: string; clarification: string | null; order: unknown;
  expectedQuote: { currency: string; priceVersion: string; effectiveAt: string;
    lines: Record<string, { quantity: number; unitPriceFen: number; subtotalFen: number }>; totalFen: number };
}>;
const pricePath = fileURLToPath(new URL("../config/prices.json", import.meta.url));

test.each(demos)(`${live ? "live" : "offline"} $id`, async demo => {
  const quote = await quoteOrder(demo.input, {
    extract: extract ?? (async () => OrderSchema.parse(demo.order)),
    clarifications: demo.clarification ? [demo.clarification] : [], pricePath,
  });
  expect(quote).toMatchObject(demo.expectedQuote);
  expect(quote.lines).toEqual(demo.expectedQuote.lines);
  const expectedOrder = OrderSchema.parse(demo.order);
  const expectedDefaults = expectedOrder.sections.reduce((n, s) => n + Number(s.copies === null) + Number(s.layoutPages === null), 0);
  expect(quote.defaults).toHaveLength(expectedDefaults);
  expect(quote.defaults.filter(d => d.includes("未注明份数"))).toHaveLength(expectedOrder.sections.filter(s => s.copies === null).length);
  expect(quote.defaults.filter(d => d.includes("未注明排版范围"))).toHaveLength(expectedOrder.sections.filter(s => s.layoutPages === null).length);
  const counts = (sections: ReturnType<typeof normalizeOrder>["sections"]) =>
    sections.map(s => [s.pages, s.copies, s.layoutPages]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  expect(counts(quote.order.sections)).toEqual(counts(normalizeOrder(expectedOrder).sections));
}, 240_000);

test("missing details require clarification; invalid quantities and duplicate sources fail", () => {
  expect(() => normalizeOrder({ sections: [], books: null, questions: [] })).toThrow(ClarificationRequired);
  const order = OrderSchema.parse(demos[0]!.order);
  expect(() => normalizeOrder({ ...order, sections: [order.sections[0], order.sections[0]] })).toThrow("同一来源");
  expect(() => normalizeOrder({ ...order, books: 0.5 })).toThrow();
  expect(() => normalizeOrder({ ...order, sections: [{ ...order.sections[0], layoutPages: 11 }] })).toThrow("排版页数");
});

test("rejects quantity, subtotal and total overflow; formats safe fen exactly", async () => {
  const prices = await getPriceList(pricePath);
  const order = OrderSchema.parse(demos[0]!.order);
  expect(() => calculateQuote({ ...order, sections: [{ source: "x", pages: Number.MAX_SAFE_INTEGER, copies: 2, layoutPages: 0 }] }, prices)).toThrow("安全整数");
  expect(() => calculateQuote(order, { ...prices, print_per_page_fen: Number.MAX_SAFE_INTEGER })).toThrow("安全整数");
  expect(() => calculateQuote({ sections: [{ source: "x", pages: 1, copies: 1, layoutPages: 1 }], books: 0, questions: [] }, { ...prices, layout_per_source_page_fen: Number.MAX_SAFE_INTEGER })).toThrow("安全整数");
  expect(yuan(Number.MAX_SAFE_INTEGER)).toBe("90071992547409.91");
  await expect(getPriceList("does-not-exist-prices.json")).rejects.toThrow("价目表");
  expect(() => calculateQuote(order, { ...prices, print_per_page_fen: -1 })).toThrow();
});
