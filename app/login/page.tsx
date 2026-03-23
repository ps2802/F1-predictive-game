"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy, useLogin, type User } from "@privy-io/react-auth";
import { handlePrivyAuthComplete } from "@/lib/auth";

/**
 * /login — unified auth entry point for Gridlock.
 *
 * Handles both new signups and returning logins through the same Privy modal.
 * Privy determines whether the user is new internally. After auth:
 *   - New user (no username)  → /onboarding
 *   - Returning user          → /dashboard (or ?redirect=)
 *
 * The separate /signup route redirects here so there is one canonical path.
 */
function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? null;

  const { getAccessToken } = usePrivy();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onComplete = useCallback(
    async (_: { user: User }) => {
      setError(null);
      try {
        await handlePrivyAuthComplete(getAccessToken, redirect, router);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sign-in failed.";
        setError(msg.includes("fetch") ? "Network error — please try again." : "Sign-in failed. Please try again.");
        setLoading(false);
      }
    },
    [getAccessToken, redirect, router]
  );

  const onError = useCallback((_err: unknown) => {
    setError("Sign-in failed. Please try again.");
    setLoading(false);
  }, []);

  const { login } = useLogin({ onComplete, onError });

  const handleEnter = () => {
    setLoading(true);
    setError(null);
    login();
  };

  return (
    <div className="gl-login-root">
      {/* ── Right: Driver hero image ── */}
      <div className="gl-login-visual" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock f1 driver .png"
          alt=""
          className="gl-login-driver"
          draggable={false}
        />
        <div className="gl-login-img-overlay" />
        <div className="gl-login-vstrip" />
      </div>

      {/* ── Left: Content panel ── */}
      <div className="gl-login-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="gl-login-logo"
          draggable={false}
        />

        <p className="gl-login-eyebrow">
          <span className="gl-login-dot" />
          2026 SEASON · NOW LIVE
        </p>

        <h1 className="gl-login-h1">
          You either<br />
          see the grid<br />
          <em>— or you don&apos;t.</em>
        </h1>

        <p className="gl-login-sub">
          Opinions are free. Points aren&apos;t.<br />
          Predict qualifying, race results, and driver battles
          across 24 rounds. Your rivals placed last race.
          Did you?
        </p>

        <div className="gl-login-stats">
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">24</span>
            <span className="gl-login-stat-l">Rounds</span>
          </div>
          <div className="gl-login-stat-div" />
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">20</span>
            <span className="gl-login-stat-l">Drivers</span>
          </div>
          <div className="gl-login-stat-div" />
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">1</span>
            <span className="gl-login-stat-l">Champion</span>
          </div>
        </div>

        <button
          className="gl-login-btn"
          onClick={handleEnter}
          disabled={loading}
        >
          {loading ? <span className="gl-login-spinner" /> : "ENTER THE GRID"}
        </button>

        {error && <p className="gl-login-error">{error}</p>}

        <p className="gl-login-urgency">
          Every race you sit out is a race you can never win back.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
