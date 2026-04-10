import path from "node:path";
import {
  type CanaryScenarioName,
  type E2EEnvironmentConfig,
  type E2EEnvironmentName,
  BlockedRunError,
} from "../helpers/types";

function normalizeEnvName(value: string | undefined): E2EEnvironmentName {
  if (value === "local" || value === "preview" || value === "prod") {
    return value;
  }

  return "local";
}

function resolveBaseUrl(env: E2EEnvironmentName): string {
  const explicit =
    process.env.GRIDLOCK_CANARY_BASE_URL ??
    (env === "local"
      ? process.env.GRIDLOCK_CANARY_BASE_URL_LOCAL
      : env === "preview"
        ? process.env.GRIDLOCK_CANARY_BASE_URL_PREVIEW
        : process.env.GRIDLOCK_CANARY_BASE_URL_PROD);

  if (!explicit) {
    throw new BlockedRunError(
      "config.base_url",
      `Missing base URL for ${env}. Set GRIDLOCK_CANARY_BASE_URL${env === "local" ? "_LOCAL" : env === "preview" ? "_PREVIEW" : "_PROD"}.`
    );
  }

  return explicit.replace(/\/$/, "");
}

export function loadEnvironmentConfig(): E2EEnvironmentConfig {
  const name = normalizeEnvName(process.env.GRIDLOCK_CANARY_ENV);
  const outputDir =
    process.env.GRIDLOCK_CANARY_OUTPUT_DIR ??
    path.join(process.cwd(), ".e2e-artifacts", name);

  return {
    name,
    baseUrl: resolveBaseUrl(name),
    allowWrites: true,
    useDisposableSignup: name !== "prod",
    privateLeaguePrefix: `[E2E][${name.toUpperCase()}]`,
    requireStablePersonas: name === "prod",
    timeoutMs: Number(process.env.GRIDLOCK_CANARY_TIMEOUT_MS ?? 120_000),
    outputDir,
  };
}

export function loadScenario(): CanaryScenarioName {
  const value = process.env.GRIDLOCK_CANARY_SCENARIO;
  return value === "fresh-signup-smoke" ? "fresh-signup-smoke" : "full-two-user";
}
