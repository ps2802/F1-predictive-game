"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy, useLogin, type User } from "@privy-io/react-auth";
import { handlePrivyAuthComplete } from "@/lib/auth";
import { track } from "@/lib/analytics";

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

  const { getAccessToken, authenticated } = usePrivy();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onComplete = useCallback(
    async (result: { user: User }) => {
      setError(null);
      try {
        track("auth_completed", { privy_user_id: result.user.id });
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
    // If already authenticated with Privy (existing session), skip the modal
    // and go straight to the Supabase sync — calling login() when already
    // authenticated causes Privy to throw "user is already logged in".
    if (authenticated) {
      handlePrivyAuthComplete(getAccessToken, redirect, router).catch((err) => {
        const msg = err instanceof Error ? err.message : "Sign-in failed.";
        setError(msg.includes("fetch") ? "Network error — please try again." : "Sign-in failed. Please try again.");
        setLoading(false);
      });
      return;
    }
    login();
  };

  return (
    <div className="gl-login-root">
      {/* ── Left: Content panel ── */}
      <div className="gl-login-panel">

        {/* Speed lines — diagonal streaks in background */}
        <div className="gl-login-speedlines" aria-hidden="true">
          <svg viewBox="0 0 520 800" preserveAspectRatio="xMinYMid slice" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <g stroke="rgba(225,6,0,0.07)" strokeWidth="1" fill="none">
              <line x1="-60" y1="180" x2="580" y2="110" />
              <line x1="-60" y1="220" x2="580" y2="150" />
              <line x1="-60" y1="260" x2="580" y2="190" />
              <line x1="-60" y1="300" x2="580" y2="230" />
              <line x1="-60" y1="340" x2="580" y2="270" strokeOpacity="0.04" />
            </g>
            {/* Corner number — F1 marshal post aesthetic */}
            <text x="32" y="52" fontFamily="monospace" fontSize="9" fill="rgba(225,6,0,0.18)" letterSpacing="3">SECTOR 01</text>
            <line x1="30" y1="56" x2="160" y2="56" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8" />
            {/* Timing gap indicators */}
            <text x="32" y="780" fontFamily="monospace" fontSize="8" fill="rgba(255,255,255,0.07)" letterSpacing="2">+0.000s GAP</text>
          </svg>
        </div>

        {/* F1 car wireframe — large background element */}
        <div className="gl-login-f1-bg" aria-hidden="true">
          <svg viewBox="0 0 900 260" xmlns="http://www.w3.org/2000/svg">
            {/* Main chassis body */}
            <path
              d="M 35,148 L 35,132 Q 90,108 158,103 L 205,101 Q 224,82 244,57 L 292,50 Q 342,46 372,54 L 402,101 L 525,98 Q 602,95 648,103 Q 700,111 722,122 L 722,148 Z"
              fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="1.4"
            />
            {/* Cockpit / halo */}
            <path
              d="M 255,101 Q 262,72 288,57 L 314,53 Q 344,50 364,58 L 374,101"
              fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="1.1"
            />
            {/* Halo bar */}
            <path d="M 265,74 Q 315,60 363,72" fill="none" stroke="rgba(225,6,0,0.14)" strokeWidth="2.5" strokeLinecap="round" />
            {/* Front wing main plane */}
            <path d="M 18,151 L 18,163 L 132,163 L 132,151" fill="none" stroke="rgba(225,6,0,0.28)" strokeWidth="1.4" />
            {/* Front wing upper flap */}
            <path d="M 22,148 L 128,146" fill="none" stroke="rgba(225,6,0,0.16)" strokeWidth="0.8" />
            {/* Front wing endplates */}
            <line x1="18" y1="142" x2="18" y2="166" stroke="rgba(225,6,0,0.2)" strokeWidth="1" />
            <line x1="132" y1="142" x2="132" y2="166" stroke="rgba(225,6,0,0.2)" strokeWidth="1" />
            {/* Front wheel */}
            <circle cx="168" cy="168" r="32" fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="1.4" />
            <circle cx="168" cy="168" r="20" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="0.8" />
            <line x1="168" y1="136" x2="168" y2="200" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6" />
            <line x1="136" y1="168" x2="200" y2="168" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6" />
            {/* Front suspension */}
            <path d="M 137,162 L 95,145 M 200,162 L 225,145" fill="none" stroke="rgba(225,6,0,0.15)" strokeWidth="0.9" />
            <path d="M 142,175 L 95,158 M 195,175 L 225,158" fill="none" stroke="rgba(225,6,0,0.15)" strokeWidth="0.9" />
            {/* Rear wheel */}
            <circle cx="645" cy="170" r="36" fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="1.4" />
            <circle cx="645" cy="170" r="23" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="0.8" />
            <line x1="645" y1="134" x2="645" y2="206" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6" />
            <line x1="609" y1="170" x2="681" y2="170" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6" />
            {/* Rear suspension */}
            <path d="M 610,163 L 565,147 M 680,163 L 705,145" fill="none" stroke="rgba(225,6,0,0.15)" strokeWidth="0.9" />
            {/* Rear wing endplates */}
            <line x1="688" y1="64" x2="688" y2="150" stroke="rgba(225,6,0,0.18)" strokeWidth="1" />
            <line x1="768" y1="62" x2="768" y2="150" stroke="rgba(225,6,0,0.18)" strokeWidth="1" />
            {/* Rear wing main plane */}
            <path d="M 686,80 L 770,77 L 770,68 L 686,71 Z" fill="none" stroke="rgba(225,6,0,0.28)" strokeWidth="1.4" />
            {/* Rear wing upper flap */}
            <path d="M 688,82 L 768,79 L 768,74 L 688,76 Z" fill="none" stroke="rgba(225,6,0,0.16)" strokeWidth="0.8" />
            {/* DRS slot */}
            <line x1="690" y1="75" x2="766" y2="72" stroke="rgba(225,6,0,0.1)" strokeWidth="0.6" strokeDasharray="3,6" />
            {/* Engine cover / air intake fin */}
            <path d="M 402,100 L 424,58 L 488,62 L 525,98" fill="none" stroke="rgba(225,6,0,0.16)" strokeWidth="1" />
            {/* Sidepod inlet */}
            <path d="M 402,101 Q 412,88 430,85 L 450,84" fill="none" stroke="rgba(225,6,0,0.14)" strokeWidth="0.9" />
            {/* Diffuser */}
            <path d="M 688,148 L 770,152 L 770,165 L 688,160" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="1" />
            {/* Floor undercut detail */}
            <path d="M 205,148 L 600,148" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7" strokeDasharray="5,10" />
            {/* Side mirror */}
            <path d="M 248,89 L 258,82 L 274,82 L 274,89" fill="none" stroke="rgba(225,6,0,0.16)" strokeWidth="0.8" />
            {/* Bargeboards / turning vanes */}
            <path d="M 235,120 L 245,108 M 248,118 L 258,106 M 261,116 L 270,105" fill="none" stroke="rgba(225,6,0,0.14)" strokeWidth="0.8" />
            {/* Technical measurement lines */}
            <line x1="35" y1="200" x2="722" y2="200" stroke="rgba(225,6,0,0.06)" strokeWidth="0.6" strokeDasharray="2,12" />
            <line x1="35" y1="196" x2="35" y2="204" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8" />
            <line x1="722" y1="196" x2="722" y2="204" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8" />
            {/* Wheelbase annotation */}
            <line x1="168" y1="215" x2="645" y2="215" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6" />
            <text x="380" y="225" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="rgba(225,6,0,0.14)" letterSpacing="2">WHEELBASE 3600mm</text>
          </svg>
        </div>

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

        {/* F1 sector indicator bars */}
        <div className="gl-login-sectors" aria-hidden="true">
          <span className="gl-login-sector gl-login-sector-1" />
          <span className="gl-login-sector gl-login-sector-2" />
          <span className="gl-login-sector gl-login-sector-3" />
        </div>

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
