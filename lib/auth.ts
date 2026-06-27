"use client";

/**
 * lib/auth.ts — Google sign-in via Supabase OAuth (PKCE).
 *
 * Gridlock is Web2-only: the single supported identity provider is Google,
 * configured in the Supabase dashboard. signInWithGoogle() kicks off the OAuth
 * redirect; the browser comes back to /auth/callback, which exchanges the code
 * for a Supabase cookie session and routes the user to onboarding (first login)
 * or the dashboard. Every other surface still reads identity via
 * supabase.auth.getUser(), so nothing downstream changes.
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

/** Only allow same-origin relative paths to prevent open-redirect abuse. */
export function sanitizeRedirect(redirectTo: string | null | undefined): string | null {
  return redirectTo && /^\/[^/]/.test(redirectTo) ? redirectTo : null;
}

/**
 * signInWithGoogle — starts the Supabase Google OAuth flow.
 * On success the browser is redirected to Google and then back to
 * /auth/callback?next=<redirect>. Throws on configuration/SDK errors so the
 * caller can surface a message instead of hanging on a spinner.
 */
export async function signInWithGoogle(redirectTo: string | null): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "Supabase not configured — check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const next = sanitizeRedirect(redirectTo);
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  if (next) {
    callbackUrl.searchParams.set("next", next);
  }

  track("auth_started", { provider: "google", redirect_to: next ?? undefined });

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) {
    track("auth_failed", { provider: "google", reason: error.message });
    throw new Error(`Google sign-in failed: ${error.message}`);
  }
}
