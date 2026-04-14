import posthog from "posthog-js";
import {
  getPageGroup,
  getRaceIdFromPath,
  sanitizeAnalyticsProperties,
  type AnalyticsUserTraits,
  type GridlockEventName,
  type GridlockEventProperties,
  type TrackOptions,
} from "@/lib/analytics.shared";

export {
  getPageGroup,
  getRaceIdFromPath,
};

type AcquisitionContext = {
  landing_path?: string;
  referrer?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_medium?: string;
  utm_source?: string;
};

declare global {
  interface Window {
    __gridlockClarityInitialized?: boolean;
    __gridlockPostHogInitialized?: boolean;
    clarity?: (...args: unknown[]) => void;
    posthog?: typeof posthog;
  }
}

const ANALYTICS_FLAG = "true";
const ACQUISITION_STORAGE_KEY = "gridlock:first-touch:v1";
const CLARITY_MILESTONES = new Set<GridlockEventName>([
  "auth_completed",
  "league_created",
  "league_joined",
  "onboarding_completed",
  "prediction_edit_submitted",
  "prediction_submitted",
  "withdrawal_requested",
]);
function isAnalyticsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === ANALYTICS_FLAG
  );
}

function getBrowserAcquisitionContext(): AcquisitionContext {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(ACQUISITION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as AcquisitionContext;
  } catch {
    return {};
  }
}

function persistAcquisitionContext(context: AcquisitionContext): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Never block the user on analytics persistence.
  }
}

function resolveReferrerHost(referrer: string): string | undefined {
  if (!referrer) {
    return undefined;
  }

  try {
    return new URL(referrer).hostname;
  } catch {
    return undefined;
  }
}

function mergeAcquisitionContext(
  existing: AcquisitionContext,
  next: AcquisitionContext
): AcquisitionContext {
  return Object.fromEntries(
    Object.entries({ ...next, ...existing }).filter(([, value]) => Boolean(value))
  ) as AcquisitionContext;
}

function registerAcquisitionContext(context: AcquisitionContext): void {
  if (typeof window === "undefined" || !window.posthog) {
    return;
  }

  const payload = sanitizeAnalyticsProperties(context);
  if (Object.keys(payload).length === 0) {
    return;
  }

  window.posthog.register_once(payload);
}

function setAcquisitionContext(
  properties?: GridlockEventProperties | null
): void {
  if (typeof window === "undefined") {
    return;
  }

  const next = sanitizeAnalyticsProperties(properties) as AcquisitionContext;
  const merged = mergeAcquisitionContext(getBrowserAcquisitionContext(), next);

  persistAcquisitionContext(merged);
  registerAcquisitionContext(merged);
}

export function captureInitialAcquisitionContext(): void {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  setAcquisitionContext({
    landing_path: window.location.pathname,
    referrer: resolveReferrerHost(document.referrer),
    utm_campaign: params.get("utm_campaign") ?? undefined,
    utm_content: params.get("utm_content") ?? undefined,
    utm_medium: params.get("utm_medium") ?? undefined,
    utm_source: params.get("utm_source") ?? undefined,
  });
}

function trackClarityEvent(event: GridlockEventName, options?: TrackOptions): void {
  if (
    typeof window === "undefined" ||
    !window.clarity ||
    options?.send_to_clarity === false ||
    !CLARITY_MILESTONES.has(event)
  ) {
    return;
  }

  try {
    window.clarity("event", event);
  } catch {
    // Analytics must never throw into the UX.
  }
}

export function track(
  event: GridlockEventName,
  properties?: GridlockEventProperties,
  options?: TrackOptions
): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) {
    return;
  }

  const payload = sanitizeAnalyticsProperties({
    ...getBrowserAcquisitionContext(),
    ...properties,
    capture_source: "client",
  });

  try {
    if (options?.send_to_posthog !== false) {
      window.posthog?.capture(event, payload);
    }
  } catch {
    // Never let analytics throw.
  }

  trackClarityEvent(event, options);
}

export function identifyUser(
  distinctId: string,
  properties?: AnalyticsUserTraits
): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) {
    return;
  }

  const payload = sanitizeAnalyticsProperties(properties);

  try {
    window.posthog?.identify(distinctId, payload);
  } catch {
    // Ignore analytics errors.
  }

  setClarityTag("auth_state", "authenticated");
}

export function resetAnalytics(): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) {
    return;
  }

  try {
    window.posthog?.reset();
  } catch {
    // Ignore analytics errors.
  }

  setClarityTag("auth_state", "anonymous");
}

export function setClarityTag(key: string, value: string | null | undefined): void {
  if (
    typeof window === "undefined" ||
    !window.clarity ||
    !value ||
    !isAnalyticsEnabled()
  ) {
    return;
  }

  try {
    window.clarity("set", key, value);
  } catch {
    // Ignore analytics errors.
  }
}

export function initPostHogClient(): void {
  if (
    typeof window === "undefined" ||
    window.__gridlockPostHogInitialized ||
    !isAnalyticsEnabled()
  ) {
    return;
  }

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  if (!key) {
    return;
  }

  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageleave: true,
    capture_pageview: true,
    persistence: "localStorage",
  });

  window.posthog = posthog;
  window.__gridlockPostHogInitialized = true;
  registerAcquisitionContext(getBrowserAcquisitionContext());
}

export function initClarityClient(): void {
  if (
    typeof window === "undefined" ||
    window.__gridlockClarityInitialized ||
    !isAnalyticsEnabled()
  ) {
    return;
  }

  const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  if (!projectId) {
    return;
  }

  (function setupClarity(
    c: Window,
    l: Document,
    i: string
  ) {
    c.clarity =
      c.clarity ||
      function clarityQueue(...args: unknown[]) {
        ((c.clarity as unknown as { q?: unknown[][] }).q =
          (c.clarity as unknown as { q?: unknown[][] }).q || []).push(args);
      };

    const script = l.createElement("script");
    script.async = true;
    script.src = `https://www.clarity.ms/tag/${i}`;
    const firstScript = l.getElementsByTagName("script")[0];
    firstScript?.parentNode?.insertBefore(script, firstScript);
  })(window, document, projectId);

  window.__gridlockClarityInitialized = true;
  setClarityTag("auth_state", "anonymous");
}
