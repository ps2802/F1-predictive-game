import { type E2EEnvironmentConfig, type MailboxProvider, type SyntheticPersona, BlockedRunError } from "./types";

function usernameFromEmail(email: string): string {
  return email.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || "gridlockuser";
}

async function buildPersona(
  mailbox: MailboxProvider,
  label: string,
  preferredEmail?: string,
  reusable = false
): Promise<SyntheticPersona> {
  const inbox = await mailbox.getOrCreateInbox(label, preferredEmail);
  return {
    label,
    email: inbox.email,
    username: usernameFromEmail(inbox.email),
    inboxId: inbox.inboxId,
    reusable,
  };
}

export async function resolveFullFlowPersonas(
  config: E2EEnvironmentConfig,
  mailbox: MailboxProvider,
  runId: string
): Promise<[SyntheticPersona, SyntheticPersona]> {
  const emailA = process.env.GRIDLOCK_CANARY_PERSONA_A_EMAIL;
  const emailB = process.env.GRIDLOCK_CANARY_PERSONA_B_EMAIL;

  if (config.requireStablePersonas && (!emailA || !emailB)) {
    throw new BlockedRunError(
      "personas.config",
      "Production full-two-user runs require GRIDLOCK_CANARY_PERSONA_A_EMAIL and GRIDLOCK_CANARY_PERSONA_B_EMAIL."
    );
  }

  const personaA = await buildPersona(
    mailbox,
    `${config.name}-user-a-${runId}`,
    emailA,
    Boolean(emailA)
  );
  const personaB = await buildPersona(
    mailbox,
    `${config.name}-user-b-${runId}`,
    emailB,
    Boolean(emailB)
  );

  return [personaA, personaB];
}

export async function resolveSmokePersona(
  config: E2EEnvironmentConfig,
  mailbox: MailboxProvider,
  runId: string
): Promise<SyntheticPersona> {
  return buildPersona(mailbox, `${config.name}-signup-smoke-${runId}`);
}
