type AnalyticsPrimitive = string | number | boolean | null | undefined;

export type GridlockEventName =
  | "add_money_onramp_completed"
  | "add_money_onramp_failed"
  | "add_money_started"
  | "auth_completed"
  | "auth_failed"
  | "auth_started"
  | "dashboard_viewed"
  | "how_it_works_clicked"
  | "landing_cta_clicked"
  | "landing_viewed"
  | "leaderboard_viewed"
  | "league_create_started"
  | "league_created"
  | "league_join_attempted"
  | "league_join_failed"
  | "league_joined"
  | "login_viewed"
  | "onboarding_completed"
  | "onboarding_skipped"
  | "onboarding_viewed"
  | "prediction_edit_started"
  | "prediction_edit_submitted"
  | "prediction_saved_draft"
  | "prediction_started"
  | "prediction_step_completed"
  | "prediction_submit_failed"
  | "prediction_submitted"
  | "profile_viewed"
  | "race_card_clicked"
  | "race_locked"
  | "race_scored"
  | "league_settled"
  | "wallet_viewed"
  | "withdrawal_failed"
  | "withdrawal_requested"
  | "withdrawal_started";

export type GridlockEventProperties = Record<string, AnalyticsPrimitive>;
export type AnalyticsUserTraits = GridlockEventProperties;

export type TrackOptions = {
  send_to_clarity?: boolean;
  send_to_posthog?: boolean;
};

const BANNED_PROPERTY_FRAGMENTS = [
  "access_token",
  "answer",
  "email",
  "invite_code",
  "transaction_hash",
  "tx_hash",
  "wallet_address",
] as const;

export function sanitizeAnalyticsProperties(
  properties?: GridlockEventProperties | null
): GridlockEventProperties {
  if (!properties) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (
        value === undefined ||
        typeof value === "object" ||
        BANNED_PROPERTY_FRAGMENTS.some((fragment) =>
          key.toLowerCase().includes(fragment)
        )
      ) {
        return false;
      }

      return true;
    })
  );
}

export function getPageGroup(pathname: string): string {
  if (pathname === "/") {
    return "landing";
  }

  if (pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return "auth";
  }

  if (pathname.startsWith("/onboarding")) {
    return "onboarding";
  }

  if (pathname.startsWith("/predict/")) {
    return "prediction";
  }

  if (pathname.startsWith("/leaderboard")) {
    return "leaderboard";
  }

  if (pathname.startsWith("/leagues")) {
    return "leagues";
  }

  if (pathname.startsWith("/wallet")) {
    return "wallet";
  }

  if (pathname.startsWith("/profile")) {
    return "profile";
  }

  if (pathname.startsWith("/dashboard")) {
    return "dashboard";
  }

  return "app";
}

export function getRaceIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/predict/")) {
    return null;
  }

  return pathname.split("/")[2] ?? null;
}
