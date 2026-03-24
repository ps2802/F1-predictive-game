"use client";

/**
 * lib/auth.ts — Shared auth helpers for the Privy → Supabase session bridge.
 *
 * Extracted from app/login/page.tsx so both the login and signup routes share
 * identical post-auth logic without a fragile cross-page import.
 *
 * Root cause of the previous auth failure:
 *   1. getAccessToken() can return null immediately after Privy's onComplete
 *      fires — the Privy SDK sometimes needs a brief moment to make the token
 *      available. The old code silently returned on null, leaving the loading
 *      spinner stuck forever with no error shown.
 *   2. @supabase/ssr uses PKCE by default. Calling verifyOtp() with a server-
 *      generated magic-link token fails if no PKCE code_verifier was stored by
 *      the client. Fix: createBrowserClient uses flowType: 'implicit'.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RouterLike = { push: (href: string) => void };

/**
 * Retries getAccessToken() with backoff until the token is available.
 * Privy's onComplete can fire before the access token is ready.
 */
async function getAccessTokenWithRetry(
  getAccessToken: () => Promise<string | null>,
  maxAttempts = 6
): Promise<string> {
  const delays = [150, 300, 500, 800, 1200];
  for (let i = 0; i < maxAttempts; i++) {
    const token = await getAccessToken();
    if (token) return token;
    if (i < delays.length) {
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
  throw new Error(
    "Could not get Privy access token after retries. Please try again."
  );
}

/**
 * handlePrivyAuthComplete — called from onComplete after any Privy login/signup.
 *
 * Flow:
 *   1. Get Privy access token (retries if not immediately available)
 *   2. POST /api/auth/privy-sync → creates/finds Supabase user, returns OTP
 *   3. verifyOtp → establishes Supabase browser session cookie
 *   4. Redirect: no username → /onboarding; returning user → /dashboard
 */
export async function handlePrivyAuthComplete(
  getAccessToken: () => Promise<string | null>,
  redirectTo: string | null,
  router: RouterLike
): Promise<void> {
  // Step 1: Privy token (with retry for race condition)
  const accessToken = await getAccessTokenWithRetry(getAccessToken);

  // Step 2: Sync Privy identity to Supabase
  const res = await fetch("/api/auth/privy-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "unknown error");
    throw new Error(`Auth sync failed (${res.status}): ${body}`);
  }

  const { token, email } = (await res.json()) as { token: string; email: string };

  // Step 3: Establish Supabase browser session
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "Supabase not configured — check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  // type must be "magiclink" — the token was generated via
  // admin.auth.admin.generateLink({ type: "magiclink" }) and Supabase
  // returns 403 if you verify it as type "email" (a different OTP flow).
  const { error: otpError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "magiclink",
  });

  if (otpError) {
    throw new Error(`Session handshake failed: ${otpError.message}`);
  }

  // Step 4: Redirect
  if (redirectTo) {
    router.push(redirectTo);
    return;
  }

  // New users (no username yet) go through onboarding; returning users skip it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    if (!prof?.username) {
      router.push("/onboarding");
      return;
    }
  }

  router.push("/dashboard");
}
