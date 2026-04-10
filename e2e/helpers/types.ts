export type E2EEnvironmentName = "local" | "preview" | "prod";
export type CanaryScenarioName = "full-two-user" | "fresh-signup-smoke";
export type SyntheticRunStatus = "passed" | "failed" | "blocked";

export interface E2EEnvironmentConfig {
  name: E2EEnvironmentName;
  baseUrl: string;
  allowWrites: boolean;
  useDisposableSignup: boolean;
  privateLeaguePrefix: string;
  requireStablePersonas: boolean;
  timeoutMs: number;
  outputDir: string;
}

export interface MailboxProvider {
  getOrCreateInbox(
    alias: string,
    preferredEmail?: string
  ): Promise<{ email: string; inboxId: string }>;
  waitForPrivyEmail(
    email: string,
    timeoutMs: number,
    options?: { inboxId?: string; sinceMs?: number }
  ): Promise<{ subject: string; html: string; text: string; receivedAt: string }>;
  disposeInbox?(inboxId: string): Promise<void>;
}

export interface SyntheticPersona {
  label: string;
  email: string;
  username: string;
  inboxId: string;
  reusable: boolean;
}

export interface SyntheticArtifactRef {
  label: string;
  path: string;
}

export interface SyntheticStepResult {
  step: string;
  status: "passed" | "failed" | "blocked";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  message?: string;
}

export interface SyntheticRunReport {
  runId: string;
  env: E2EEnvironmentName;
  scenario: CanaryScenarioName;
  status: SyntheticRunStatus;
  failedStep?: string;
  failureMessage?: string;
  consoleErrors: string[];
  networkFailures: string[];
  artifacts: {
    screenshots: string[];
    trace?: string;
    video?: string;
  };
  timingsMs: Record<string, number>;
  steps: SyntheticStepResult[];
}

export class BlockedRunError extends Error {
  step: string;

  constructor(step: string, message: string) {
    super(message);
    this.name = "BlockedRunError";
    this.step = step;
  }
}
