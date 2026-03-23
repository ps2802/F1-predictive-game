"use client";

import Link from "next/link";
import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy, useLogin, type User } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Shared post-login handler used by both /login and /signup.
 * After Privy authenticates the user this:
 *   1. Exchanges the Privy token for a Supabase session via /api/auth/privy-sync
 *   2. Establishes the Supabase session client-side (so all existing API routes work)
 *   3. Redirects to onboarding (new users) or dashboard (returning users)
 */
export async function handlePrivyLoginComplete(
  getAccessToken: () => Promise<string | null>,
  redirectTo: string | null,
  router: ReturnType<typeof useRouter>
) {
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const res = await fetch("/api/auth/privy-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });

  if (!res.ok) {
    console.error("privy-sync failed", await res.text());
    return;
  }

  const { token, email } = await res.json();

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    console.error("Supabase verifyOtp failed", error.message);
    return;
  }

  if (redirectTo) {
    router.push(redirectTo);
    return;
  }

  // Check if user still needs to set a username (first login = onboarding).
  const { data: { user } } = await supabase.auth.getUser();
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? null;
  const { getAccessToken } = usePrivy();
  const [error, setError] = useState<string | null>(null);

  // Privy v3: onComplete receives { user, isNewUser, wasAlreadyAuthenticated, ... }
  const onComplete = useCallback(async ({ user }: { user: User }) => {
    console.log("[Privy] login complete for", user.id);
    setError(null);
    try {
      await handlePrivyLoginComplete(getAccessToken, redirect, router);
    } catch (err) {
      console.error("[Privy] post-login sync failed", err);
      setError("Sign-in failed. Please try again.");
    }
  }, [getAccessToken, redirect, router]);

  const onError = useCallback((err: unknown) => {
    console.error("[Privy] login error", err);
    setError("Sign-in failed. Please try again.");
  }, []);

  const { login } = useLogin({ onComplete, onError });

  return (
    <>
      <div className="gl-stripe" aria-hidden="true" />
      <div className="gla-auth-root">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="gla-auth-logo"
          draggable={false}
        />

        <div className="gla-auth-card">
          <p className="gla-auth-eyebrow">Driver login</p>
          <h1 className="gla-auth-title">Sign in</h1>
          <p className="gla-auth-sub">
            Welcome back. Continue with your email or social account.
          </p>

          <button className="gla-auth-btn" onClick={login}>
            Sign in
          </button>

          {error && (
            <p className="gla-auth-msg is-error">{error}</p>
          )}

          <div className="gla-auth-footer">
            New to Gridlock? <Link href="/signup">Create an account</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
