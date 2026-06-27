# Gridlock E2E Canary

## Purpose

This harness runs the real browser flow for Gridlock:

- Privy email auth
- onboarding
- prediction submission
- private league creation
- invite-based league join
- wallet and membership assertions

It writes screenshots, traces, and `gridlock-canary-report.json` into `.e2e-artifacts/`.

## Commands

```bash
npm run canary:gridlock -- --env local --scenario full-two-user
npm run canary:gridlock -- --env preview --scenario full-two-user
npm run canary:gridlock -- --env prod --scenario fresh-signup-smoke
```

## Required env vars

Core:

```bash
GRIDLOCK_CANARY_BASE_URL_LOCAL=
GRIDLOCK_CANARY_BASE_URL_PREVIEW=
GRIDLOCK_CANARY_BASE_URL_PROD=
GRIDLOCK_CANARY_TIMEOUT_MS=120000
```

Mailbox:

```bash
GRIDLOCK_CANARY_MAIL_PROVIDER=agentmail
GRIDLOCK_CANARY_MAIL_API_KEY=
GRIDLOCK_CANARY_MAIL_DOMAIN=agentmail.to
```

Supported mailbox providers:

- `agentmail` for stable, reusable inboxes in preview and production
- `mailtm` as a disposable local fallback when AgentMail credentials are unavailable

Stable recurring personas:

```bash
GRIDLOCK_CANARY_PERSONA_A_EMAIL=
GRIDLOCK_CANARY_PERSONA_B_EMAIL=
```

Optional alerting:

```bash
GRIDLOCK_CANARY_ALERT_WEBHOOK=
```

## Notes

- Localhost auth requires a Privy app/client that allows the local origin. Set `NEXT_PUBLIC_PRIVY_APP_ID_LOCAL` and `PRIVY_APP_SECRET_LOCAL` if you do not want local dev to reuse production Privy config.
- Preview and production runs use real Privy email auth. If that config is missing, the canary should report `blocked`.
- Production recurring runs are safest with stable persona inboxes. Those users still need enough Test USDC balance to pay the minimum league stake.
- The signup smoke scenario intentionally creates a fresh inbox and only validates signup, onboarding, and dashboard load.
