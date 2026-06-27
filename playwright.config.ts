import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "@playwright/test";

// Local runs read .env.local; preview/CI runs get env from the shell
// (e.g. `vercel env pull`). Existing process env always wins.
loadEnv({ path: ".env.local", override: false });

const baseURL =
  process.env.E2E_BASE_URL ??
  process.env.GRIDLOCK_CANARY_BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  "http://localhost:3000";

const artifactsRoot =
  process.env.GRIDLOCK_CANARY_OUTPUT_DIR ??
  path.join(process.cwd(), ".e2e-artifacts", process.env.GRIDLOCK_CANARY_ENV ?? "local");

// Pass Vercel preview Deployment Protection when a bypass token is provided.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders = bypass
  ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: Number(process.env.GRIDLOCK_CANARY_TIMEOUT_MS ?? 120_000),
  outputDir: path.join(artifactsRoot, "playwright"),
  reporter: [
    ["list"],
    ["./e2e/reporters/gridlockReporter.ts"],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
  },
});
