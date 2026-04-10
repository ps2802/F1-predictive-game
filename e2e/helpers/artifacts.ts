import fs from "node:fs/promises";
import path from "node:path";
import { type Page } from "@playwright/test";
import {
  type CanaryScenarioName,
  type E2EEnvironmentName,
  type SyntheticRunReport,
  type SyntheticRunStatus,
  type SyntheticStepResult,
} from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export function sanitizeFileComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function createRunReport(input: {
  runId: string;
  env: E2EEnvironmentName;
  scenario: CanaryScenarioName;
}): SyntheticRunReport {
  return {
    runId: input.runId,
    env: input.env,
    scenario: input.scenario,
    status: "failed",
    consoleErrors: [],
    networkFailures: [],
    artifacts: { screenshots: [] },
    timingsMs: {},
    steps: [],
  };
}

export function attachPageDiagnostics(
  page: Page,
  report: SyntheticRunReport,
  label: string
): void {
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    report.consoleErrors.push(`[${label}] ${message.text()}`);
  });

  page.on("pageerror", (error) => {
    report.consoleErrors.push(`[${label}] ${error.message}`);
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    report.networkFailures.push(
      `[${label}] ${request.method()} ${request.url()} :: ${failure?.errorText ?? "unknown"}`
    );
  });

  page.on("response", (response) => {
    if (response.status() < 400) {
      return;
    }

    report.networkFailures.push(
      `[${label}] ${response.request().method()} ${response.url()} :: HTTP ${response.status()}`
    );
  });
}

export async function captureScreenshot(
  page: Page,
  report: SyntheticRunReport,
  outputDir: string,
  label: string
): Promise<string> {
  const filePath = path.join(
    outputDir,
    `${report.runId}-${sanitizeFileComponent(label)}.png`
  );
  await page.screenshot({ path: filePath, fullPage: true });
  report.artifacts.screenshots.push(filePath);
  return filePath;
}

export async function recordStep<T>(
  report: SyntheticRunReport,
  step: string,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = nowIso();
  const startedMs = Date.now();

  try {
    const value = await fn();
    const durationMs = Date.now() - startedMs;
    report.timingsMs[step] = durationMs;
    report.steps.push({
      step,
      status: "passed",
      startedAt,
      completedAt: nowIso(),
      durationMs,
    });
    return value;
  } catch (error) {
    const durationMs = Date.now() - startedMs;
    const status: SyntheticRunStatus =
      error instanceof Error && error.name === "BlockedRunError" ? "blocked" : "failed";
    const failureMessage = error instanceof Error ? error.message : "Unknown error";
    report.timingsMs[step] = durationMs;
    report.steps.push({
      step,
      status,
      startedAt,
      completedAt: nowIso(),
      durationMs,
      message: failureMessage,
    } satisfies SyntheticStepResult);
    throw error;
  }
}

export async function writeRunReport(
  report: SyntheticRunReport,
  outputDir: string
): Promise<string> {
  await ensureDir(outputDir);
  const filePath = path.join(outputDir, "gridlock-canary-report.json");
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}
