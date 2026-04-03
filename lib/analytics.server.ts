import { PostHog } from "posthog-node";
import {
  type GridlockEventName,
  type GridlockEventProperties,
  sanitizeAnalyticsProperties,
} from "@/lib/analytics.shared";

let client: PostHog | null = null;

function isServerAnalyticsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === "true" &&
    Boolean(process.env.POSTHOG_API_KEY)
  );
}

function getClient(): PostHog | null {
  if (!isServerAnalyticsEnabled()) {
    return null;
  }

  if (!client) {
    client = new PostHog(process.env.POSTHOG_API_KEY as string, {
      flushAt: 1,
      flushInterval: 0,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    });
  }

  return client;
}

export async function trackServer(
  event: GridlockEventName,
  properties?: GridlockEventProperties,
  distinctId?: string
): Promise<void> {
  const analytics = getClient();
  if (!analytics) {
    return;
  }

  try {
    analytics.capture({
      distinctId: distinctId ?? "server",
      event,
      properties: sanitizeAnalyticsProperties({
        ...properties,
        capture_source: "server",
      }),
    });

    await analytics.flush();
  } catch (error) {
    console.error("[Gridlock] server analytics capture failed:", error);
  }
}
