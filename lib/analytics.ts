/**
 * lib/analytics.ts — Thin PostHog wrapper for Gridlock.
 *
 * Events tracked (fire locations):
 *   auth_completed       → app/login/page.tsx after Privy onComplete
 *   onboarding_completed → app/onboarding/page.tsx after username saved
 *   prediction_submitted → app/predict/[raceId]/page.tsx on save success
 *   league_joined        → app/leagues/page.tsx on join success
 *   race_locked          → app/api/cron/lock-races (server) — requires
 *                          posthog-node if server-side tracking is needed;
 *                          for beta the client-side events above are sufficient
 *
 * Usage:
 *   import { track } from "@/lib/analytics";
 *   track("prediction_submitted", { race_id: "australia-2026" });
 *
 * The module is safe to call in SSR / server components — it will no-op
 * because `posthog` is only available in the browser.
 */

type Properties = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, properties?: Properties): void {
  if (typeof window === "undefined") return;
  try {
    // @ts-expect-error posthog is injected by PostHogProvider at runtime
    window.posthog?.capture(event, properties);
  } catch {
    // Never let analytics throw
  }
}
