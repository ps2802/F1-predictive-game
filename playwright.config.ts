import path from "node:path";
import { defineConfig } from "@playwright/test";

const artifactsRoot =
  process.env.GRIDLOCK_CANARY_OUTPUT_DIR ??
  path.join(process.cwd(), ".e2e-artifacts", process.env.GRIDLOCK_CANARY_ENV ?? "local");

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
    browserName: "chromium",
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
});
