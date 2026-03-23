"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useLogin, type User } from "@privy-io/react-auth";
import { handlePrivyLoginComplete } from "@/app/login/page";

/**
 * /signup — "Join the grid"
 *
 * Keeps the distinct route and copy requested for beta. Underneath it uses
 * the same Privy login flow as /login — Privy itself handles the distinction
 * between new and returning users. New users are automatically redirected to
 * /onboarding after their wallet is created.
 */
export default function SignupPage() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const [error, setError] = useState<string | null>(null);

  // Privy v3: onComplete receives { user, isNewUser, wasAlreadyAuthenticated, ... }
  const onComplete = useCallback(async ({ user }: { user: User }) => {
    console.log("[Privy] signup complete for", user.id);
    setError(null);
    try {
      await handlePrivyLoginComplete(getAccessToken, null, router);
    } catch (err) {
      console.error("[Privy] post-signup sync failed", err);
      setError("Sign-up failed. Please try again.");
    }
  }, [getAccessToken, router]);

  const onError = useCallback((err: unknown) => {
    console.error("[Privy] signup error", err);
    setError("Sign-up failed. Please try again.");
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
          <p className="gla-auth-eyebrow">Join the grid</p>
          <h1 className="gla-auth-title">Create account</h1>
          <p className="gla-auth-sub">
            Sign up to start predicting the 2026 season. You&apos;ll get a real
            Solana wallet and 100 Beta Credits to play with.
          </p>

          <button className="gla-auth-btn" onClick={login}>
            Get started
          </button>

          {error && (
            <p className="gla-auth-msg is-error">{error}</p>
          )}

          <div className="gla-auth-footer">
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </>
  );
}
