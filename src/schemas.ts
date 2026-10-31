import { z } from "zod";

export const Quantity = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const OrderSchema = z.object({
  sections: z.array(z.object({
    source: z.string().trim().min(1),
    pages: Quantity.positive().nullable(),
    copies: Quantity.positive().nullable(),
    layoutPages: Quantity.nullable(),
  })),
  books: Quantity.nullable(),
  questions: z.array(z.string().trim().min(1)),
}).strict();
export type Order = z.infer<typeof OrderSchema>;

export const PriceSchema = z.object({
  version: z.string().trim().min(1),
  effective_at: z.string().datetime({ offset: true }),
  currency: z.literal("CNY"),
  layout_per_source_page_fen: Quantity,
  print_per_page_fen: Quantity,
  binding_per_book_fen: Quantity,
}).strict();
export type PriceList = z.infer<typeof PriceSchema>;
