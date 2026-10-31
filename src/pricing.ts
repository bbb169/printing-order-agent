import { readFile } from "node:fs/promises";
import { PriceSchema, type PriceList } from "./schemas.js";

export async function getPriceList(path = process.env.PRICE_LIST_PATH || "config/prices.json"): Promise<PriceList> {
  try {
    return PriceSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch {
    throw new Error(`无法读取有效价目表：${path}。请检查文件及价格配置。`);
  }
}
