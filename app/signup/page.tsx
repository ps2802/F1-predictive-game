"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePrivy, useLogin } from "@privy-io/react-auth";
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

  const onComplete = useCallback(async () => {
    await handlePrivyLoginComplete(getAccessToken, null, router);
  }, [getAccessToken, router]);

  const { login } = useLogin({ onComplete });

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

          <div className="gla-auth-footer">
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </>
  );
}
