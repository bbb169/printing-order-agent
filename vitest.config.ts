import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

// Vite otherwise replaces BASE_URL with its asset base ('/'). Preserve the
// application's setting without loading RUN_LIVE_TESTS from a local file.
const local = existsSync(".env") ? parse(readFileSync(".env")) : {};
export default defineConfig({
  test: { env: { BASE_URL: process.env.BASE_URL ?? local.BASE_URL ?? "https://api.deepseek.com" } },
});
