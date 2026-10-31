import { OrderSchema, PriceSchema, type Order, type PriceList } from "./schemas.js";
import { getPriceList } from "./pricing.js";

export class ClarificationRequired extends Error {
  constructor(public readonly questions: string[]) {
    super(questions.join("\n"));
  }
}

function safe(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("数量或金额超出安全整数范围。");
  return value;
}

export function normalizeOrder(input: unknown) {
  const order = OrderSchema.parse(input);
  const questions = [...order.questions];
  if (!order.sections.length) questions.push("需要打印哪些文件，各有多少页？");
  if (order.books === null) questions.push("是否装订？需要装订几本？");
  const sources = new Set<string>();
  for (const section of order.sections) {
    if (section.pages === null) questions.push(`${section.source}共有多少页？`);
    if (sources.has(section.source)) throw new Error("同一来源必须合并为一项，避免重复排版收费。");
    sources.add(section.source);
    if (section.pages !== null && section.layoutPages !== null && section.layoutPages > section.pages)
      throw new Error("排版页数不能超过来源页数。");
  }
  if (questions.length) throw new ClarificationRequired([...new Set(questions)]);
  const defaults: string[] = [];
  const sections = order.sections.map(section => {
    if (section.copies === null) defaults.push(`${section.source}：未注明份数，按 1 份。`);
    if (section.layoutPages === null) defaults.push(`${section.source}：未注明排版范围，按全部 ${section.pages} 页排版。`);
    return { ...section, pages: section.pages!, copies: section.copies ?? 1, layoutPages: section.layoutPages ?? section.pages! };
  });
  return { sections, books: order.books!, defaults };
}

export function calculateQuote(input: unknown, snapshot: PriceList) {
  const order = normalizeOrder(input);
  const prices = PriceSchema.parse(snapshot);
  const layout = order.sections.reduce((sum, s) => safe(sum + s.layoutPages), 0);
  const print = order.sections.reduce((sum, s) => safe(sum + safe(s.pages * s.copies)), 0);
  const line = (quantity: number, unitPriceFen: number) => ({ quantity, unitPriceFen, subtotalFen: safe(quantity * unitPriceFen) });
  const lines = {
    layout: line(layout, prices.layout_per_source_page_fen),
    print: line(print, prices.print_per_page_fen),
    binding: line(order.books, prices.binding_per_book_fen),
  };
  return {
    currency: prices.currency, priceVersion: prices.version, effectiveAt: prices.effective_at,
    lines, totalFen: Object.values(lines).reduce((sum, l) => safe(sum + l.subtotalFen), 0),
    defaults: order.defaults, order: { sections: order.sections, books: order.books },
  };
}
export type Quote = ReturnType<typeof calculateQuote>;
export type Extractor = (text: string, clarifications: string[]) => Promise<Order>;

export async function quoteOrder(text: string, options: {
  extract: Extractor; clarifications?: string[]; pricePath?: string;
}): Promise<Quote> {
  if (!text.trim()) throw new Error("请输入打印订单。");
  const order = await options.extract(text, options.clarifications ?? []);
  normalizeOrder(order);
  return calculateQuote(order, await getPriceList(options.pricePath));
}

export function yuan(fen: number): string {
  safe(fen);
  return `${Math.floor(fen / 100)}.${String(fen % 100).padStart(2, "0")}`;
}

export function formatQuote(quote: Quote): string {
  const labels = { layout: "排版（源页）", print: "打印（页）", binding: "装订（本）" };
  return [
    `报价 ${quote.currency} | 价目表 ${quote.priceVersion} | 生效 ${quote.effectiveAt}`,
    ...Object.entries(quote.lines).map(([key, l]) => `${labels[key as keyof typeof labels]}：${l.quantity} × ¥${yuan(l.unitPriceFen)} = ¥${yuan(l.subtotalFen)}`),
    `合计：¥${yuan(quote.totalFen)}`,
    ...quote.defaults.map(d => `采用默认值：${d}`),
  ].join("\n");
}
