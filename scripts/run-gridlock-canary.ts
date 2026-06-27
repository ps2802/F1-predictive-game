import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

type CliArgs = {
  env: "local" | "preview" | "prod";
  scenario: "full-two-user" | "fresh-signup-smoke";
  baseUrl?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }

  return {
    env: args.env === "preview" || args.env === "prod" ? args.env : "local",
    scenario: args.scenario === "fresh-signup-smoke" ? "fresh-signup-smoke" : "full-two-user",
    ...(args["base-url"] ? { baseUrl: args["base-url"] } : {}),
  };
}

async function sendFailureAlert(reportPath: string): Promise<void> {
  const webhook = process.env.GRIDLOCK_CANARY_ALERT_WEBHOOK;
  if (!webhook) {
    return;
  }

  const raw = await fs.readFile(reportPath, "utf8");
  const report = JSON.parse(raw) as {
    env: string;
    scenario: string;
    status: string;
    failedStep?: string;
    failureMessage?: string;
  };

  if (report.status !== "failed") {
    return;
  }

  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `Gridlock canary failed in ${report.env} (${report.scenario}) at ${report.failedStep ?? "unknown step"}: ${report.failureMessage ?? "unknown error"}`,
    }),
  }).catch(() => undefined);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(
    process.cwd(),
    ".e2e-artifacts",
    args.env,
    args.scenario,
    runId
  );
  await fs.mkdir(outputDir, { recursive: true });

  const env = {
    ...process.env,
    GRIDLOCK_CANARY_ENV: args.env,
    GRIDLOCK_CANARY_SCENARIO: args.scenario,
    GRIDLOCK_CANARY_RUN_ID: runId,
    GRIDLOCK_CANARY_OUTPUT_DIR: outputDir,
    ...(args.baseUrl ? { GRIDLOCK_CANARY_BASE_URL: args.baseUrl } : {}),
  };

  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["playwright", "test", "e2e/gridlock-canary.spec.ts", "--config=playwright.config.ts"],
    {
      stdio: "inherit",
      env,
      cwd: process.cwd(),
      shell: false,
    }
  );

  const exitCode: number = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
  });

  const reportPath = path.join(outputDir, "gridlock-canary-report.json");
  const reportExists = await fs
    .access(reportPath)
    .then(() => true)
    .catch(() => false);

  if (reportExists) {
    await sendFailureAlert(reportPath);
  }

  process.exit(exitCode);
}

void main();
