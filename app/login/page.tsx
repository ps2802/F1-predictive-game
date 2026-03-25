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

        {/* Full-panel F1 engineering blueprint background */}
        <div className="gl-login-engineering-bg" aria-hidden="true">
          <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
            <defs>
              <pattern id="eng-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(225,6,0,0.032)" strokeWidth="0.5"/>
              </pattern>
              <pattern id="eng-subgrid" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(225,6,0,0.016)" strokeWidth="0.3"/>
              </pattern>
            </defs>

            {/* Blueprint grids */}
            <rect width="600" height="900" fill="url(#eng-subgrid)"/>
            <rect width="600" height="900" fill="url(#eng-grid)"/>

            {/* ── Telemetry strip — left edge ── */}
            <path d="M 22,50 L 22,820" stroke="rgba(225,6,0,0.07)" strokeWidth="0.5" strokeDasharray="2,7"/>
            <path d="M 10,90 Q 16,108 22,98 Q 28,87 34,105 Q 40,124 22,142 Q 8,158 14,175 Q 20,192 22,184 Q 28,172 36,196 Q 44,220 22,240 Q 6,258 14,276 Q 22,294 22,285 Q 34,264 46,288 Q 52,302 22,324 Q 6,344 22,366 Q 38,388 22,410"
                  fill="none" stroke="rgba(225,6,0,0.2)" strokeWidth="1.1"/>
            <text x="6" y="80" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.18)" transform="rotate(-90 6 80)" letterSpacing="2.5">V_TEL · km/h</text>

            {/* ── Speed readout ── */}
            <text x="55" y="55" fontFamily="monospace" fontSize="6.5" fill="rgba(225,6,0,0.18)" letterSpacing="2">SPEED</text>
            <text x="55" y="74" fontFamily="monospace" fontSize="22" fill="rgba(225,6,0,0.13)" fontWeight="700" letterSpacing="-1">342</text>
            <text x="100" y="74" fontFamily="monospace" fontSize="7" fill="rgba(225,6,0,0.13)">km/h</text>
            <line x1="55" y1="78" x2="140" y2="78" stroke="rgba(225,6,0,0.08)" strokeWidth="0.5"/>

            {/* Throttle / Brake bars */}
            <text x="55" y="93" fontFamily="monospace" fontSize="5.5" fill="rgba(255,255,255,0.1)" letterSpacing="1.5">THR</text>
            <rect x="80" y="85" width="70" height="7" rx="1" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6"/>
            <rect x="80" y="85" width="62" height="7" rx="1" fill="rgba(0,210,170,0.1)"/>
            <text x="55" y="107" fontFamily="monospace" fontSize="5.5" fill="rgba(255,255,255,0.1)" letterSpacing="1.5">BRK</text>
            <rect x="80" y="99" width="70" height="7" rx="1" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6"/>
            <rect x="80" y="99" width="9" height="7" rx="1" fill="rgba(225,6,0,0.18)"/>

            {/* ── Circuit map — upper right ── */}
            <text x="382" y="36" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.24)" letterSpacing="2.5">CIRCUIT MAP</text>
            <line x1="382" y1="40" x2="562" y2="40" stroke="rgba(225,6,0,0.1)" strokeWidth="0.5"/>
            {/* Abstract circuit path */}
            <path d="M 400,55 L 445,50 Q 470,48 480,58 L 520,58 Q 538,58 542,72 L 537,96 Q 532,108 515,108 L 468,108 Q 452,108 447,124 L 453,148 Q 458,162 478,165 Q 508,167 520,152 Q 534,138 534,120 L 537,100"
                  fill="none" stroke="rgba(225,6,0,0.24)" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round"/>
            {/* Start/finish */}
            <line x1="415" y1="48" x2="415" y2="60" stroke="rgba(225,6,0,0.5)" strokeWidth="1.8"/>
            {/* DRS zones — teal highlight */}
            <path d="M 400,55 L 445,50" stroke="rgba(0,210,170,0.35)" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M 447,124 L 453,148" stroke="rgba(0,210,170,0.35)" strokeWidth="2.2" strokeLinecap="round"/>
            {/* Sector markers */}
            <circle cx="400" cy="55" r="3" fill="rgba(225,6,0,0.55)"/>
            <circle cx="468" cy="108" r="2.5" fill="rgba(255,200,0,0.45)"/>
            <circle cx="478" cy="165" r="2.5" fill="rgba(0,210,170,0.45)"/>
            <text x="385" y="180" fontFamily="monospace" fontSize="5.5" fill="rgba(255,255,255,0.12)" letterSpacing="1.5">S1 ▪  S2 ▪  S3 ▪</text>

            {/* ── DRS zone indicator ── */}
            <rect x="60" y="118" width="68" height="15" rx="1" fill="none" stroke="rgba(0,210,170,0.22)" strokeWidth="0.8"/>
            <text x="94" y="129" textAnchor="middle" fontFamily="monospace" fontSize="6" fill="rgba(0,210,170,0.32)" letterSpacing="1.5">DRS ZONE</text>

            {/* ── Tire compounds ── */}
            <circle cx="175" cy="130" r="11" fill="none" stroke="rgba(225,6,0,0.38)" strokeWidth="1.2"/>
            <text x="175" y="134.5" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(225,6,0,0.45)" fontWeight="700">S</text>
            <circle cx="202" cy="130" r="11" fill="none" stroke="rgba(255,200,0,0.28)" strokeWidth="1.2"/>
            <text x="202" y="134.5" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(255,200,0,0.35)" fontWeight="700">M</text>
            <circle cx="229" cy="130" r="11" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2"/>
            <text x="229" y="134.5" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(255,255,255,0.18)" fontWeight="700">H</text>
            <text x="202" y="150" textAnchor="middle" fontFamily="monospace" fontSize="5" fill="rgba(255,255,255,0.1)" letterSpacing="1.5">COMPOUNDS</text>

            {/* ── Aero flow lines — middle band ── */}
            <path d="M -10,178 Q 130,170 250,175 Q 360,180 420,171 Q 475,163 610,168" fill="none" stroke="rgba(225,6,0,0.07)" strokeWidth="1"/>
            <path d="M -10,192 Q 110,185 240,190 Q 365,195 420,186 Q 475,177 610,182" fill="none" stroke="rgba(225,6,0,0.07)" strokeWidth="1"/>
            <path d="M -10,205 Q 140,198 265,203 Q 375,208 422,200 Q 476,192 610,196" fill="none" stroke="rgba(225,6,0,0.05)" strokeWidth="0.8"/>
            <path d="M -10,215 Q 150,210 265,214 Q 375,218 424,211 Q 478,204 610,208" fill="none" stroke="rgba(225,6,0,0.05)" strokeWidth="0.8"/>
            {/* Flow diverges around body */}
            <path d="M 178,185 Q 255,165 325,162 Q 385,161 430,170" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="1.1"/>
            <path d="M 178,208 Q 255,218 325,220 Q 385,221 430,212" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="1.1"/>

            {/* Downforce arrows */}
            <g stroke="rgba(225,6,0,0.15)" strokeWidth="0.9" fill="rgba(225,6,0,0.15)">
              <line x1="195" y1="160" x2="195" y2="180"/>
              <polygon points="192,179 195,187 198,179" stroke="none"/>
              <line x1="260" y1="154" x2="260" y2="174"/>
              <polygon points="257,173 260,181 263,173" stroke="none"/>
              <line x1="330" y1="151" x2="330" y2="171"/>
              <polygon points="327,170 330,178 333,170" stroke="none"/>
              <line x1="400" y1="153" x2="400" y2="173"/>
              <polygon points="397,172 400,180 403,172" stroke="none"/>
              <line x1="462" y1="158" x2="462" y2="178"/>
              <polygon points="459,177 462,185 465,177" stroke="none"/>
            </g>
            <text x="220" y="158" fontFamily="monospace" fontSize="5.5" fill="rgba(225,6,0,0.18)" letterSpacing="2">DOWNFORCE LOAD ↓</text>

            {/* ── G-FORCE arc ── */}
            <path d="M 430,370 A 65,65 0 0 1 560,370" fill="none" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>
            <path d="M 430,370 A 65,65 0 0 1 528,312" fill="none" stroke="rgba(225,6,0,0.16)" strokeWidth="1.2" strokeDasharray="2,4"/>
            <line x1="495" y1="305" x2="495" y2="370" stroke="rgba(225,6,0,0.13)" strokeWidth="0.8"/>
            <text x="495" y="385" textAnchor="middle" fontFamily="monospace" fontSize="5.5" fill="rgba(225,6,0,0.2)" letterSpacing="2">4.8G LATERAL</text>

            {/* ── MAIN F1 CAR — large side profile filling lower half ── */}
            <g transform="translate(18, 490) scale(0.66)">
              {/* Chassis fill */}
              <path d="M 35,148 L 35,132 Q 90,108 158,103 L 205,101 Q 224,82 244,57 L 292,50 Q 342,46 372,54 L 402,101 L 525,98 Q 602,95 648,103 Q 700,111 722,122 L 722,148 Z"
                    fill="rgba(225,6,0,0.04)" stroke="rgba(225,6,0,0.3)" strokeWidth="1.7"/>
              {/* Cockpit */}
              <path d="M 255,101 Q 262,72 288,57 L 314,53 Q 344,50 364,58 L 374,101"
                    fill="none" stroke="rgba(225,6,0,0.24)" strokeWidth="1.3"/>
              {/* Halo */}
              <path d="M 262,74 Q 315,58 366,72" fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="3.2" strokeLinecap="round"/>
              <path d="M 262,74 Q 315,58 366,72" fill="none" stroke="rgba(225,6,0,0.08)" strokeWidth="6" strokeLinecap="round"/>
              {/* Front wing planes */}
              <path d="M 8,149 L 8,165 L 142,165 L 142,149" fill="rgba(225,6,0,0.03)" stroke="rgba(225,6,0,0.34)" strokeWidth="1.5"/>
              <path d="M 13,145 L 138,143" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="0.8"/>
              <path d="M 17,148 L 132,146" fill="none" stroke="rgba(225,6,0,0.12)" strokeWidth="0.6"/>
              <line x1="8" y1="140" x2="8" y2="169" stroke="rgba(225,6,0,0.26)" strokeWidth="1.1"/>
              <line x1="142" y1="140" x2="142" y2="169" stroke="rgba(225,6,0,0.26)" strokeWidth="1.1"/>
              {/* Front wheel */}
              <circle cx="180" cy="176" r="37" fill="rgba(0,0,0,0.5)" stroke="rgba(225,6,0,0.28)" strokeWidth="1.7"/>
              <circle cx="180" cy="176" r="25" fill="none" stroke="rgba(225,6,0,0.12)" strokeWidth="0.9"/>
              <circle cx="180" cy="176" r="9"  fill="none" stroke="rgba(225,6,0,0.2)"  strokeWidth="1"/>
              <line x1="180" y1="139" x2="180" y2="213" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6"/>
              <line x1="143" y1="176" x2="217" y2="176" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6"/>
              <line x1="154" y1="150" x2="206" y2="202" stroke="rgba(225,6,0,0.05)" strokeWidth="0.5"/>
              <line x1="206" y1="150" x2="154" y2="202" stroke="rgba(225,6,0,0.05)" strokeWidth="0.5"/>
              {/* Front suspension */}
              <path d="M 144,169 L 97,151 M 216,169 L 242,151" stroke="rgba(225,6,0,0.2)" strokeWidth="1.1" fill="none"/>
              <path d="M 150,183 L 97,165 M 210,183 L 242,165" stroke="rgba(225,6,0,0.2)" strokeWidth="1.1" fill="none"/>
              {/* Bargeboards */}
              <path d="M 240,120 L 253,104 M 257,118 L 270,102 M 274,116 L 287,100" stroke="rgba(225,6,0,0.16)" strokeWidth="0.9" fill="none"/>
              {/* Side mirror */}
              <path d="M 253,87 L 266,79 L 285,79 L 285,87" fill="none" stroke="rgba(225,6,0,0.2)" strokeWidth="1"/>
              {/* Sidepod inlet */}
              <path d="M 402,101 Q 420,85 443,82 L 466,81" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="1.1"/>
              {/* Engine fin */}
              <path d="M 402,100 L 429,56 L 496,60 L 525,98" fill="none" stroke="rgba(225,6,0,0.2)" strokeWidth="1.1"/>
              {/* Floor */}
              <path d="M 218,149 L 614,149" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="0.8" strokeDasharray="6,14"/>
              {/* Rear wheel */}
              <circle cx="652" cy="178" r="41" fill="rgba(0,0,0,0.5)" stroke="rgba(225,6,0,0.28)" strokeWidth="1.7"/>
              <circle cx="652" cy="178" r="28" fill="none" stroke="rgba(225,6,0,0.12)" strokeWidth="0.9"/>
              <circle cx="652" cy="178" r="10" fill="none" stroke="rgba(225,6,0,0.2)"  strokeWidth="1"/>
              <line x1="652" y1="137" x2="652" y2="219" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6"/>
              <line x1="611" y1="178" x2="693" y2="178" stroke="rgba(225,6,0,0.08)" strokeWidth="0.6"/>
              <line x1="623" y1="149" x2="681" y2="207" stroke="rgba(225,6,0,0.05)" strokeWidth="0.5"/>
              <line x1="681" y1="149" x2="623" y2="207" stroke="rgba(225,6,0,0.05)" strokeWidth="0.5"/>
              {/* Rear suspension */}
              <path d="M 613,170 L 567,153 M 691,170 L 716,152" stroke="rgba(225,6,0,0.2)" strokeWidth="1.1" fill="none"/>
              {/* Rear wing endplates */}
              <line x1="697" y1="60" x2="697" y2="158" stroke="rgba(225,6,0,0.24)" strokeWidth="1.2"/>
              <line x1="782" y1="58" x2="782" y2="158" stroke="rgba(225,6,0,0.24)" strokeWidth="1.2"/>
              {/* Rear wing planes */}
              <path d="M 695,80 L 784,77 L 784,67 L 695,70 Z" fill="rgba(225,6,0,0.04)" stroke="rgba(225,6,0,0.34)" strokeWidth="1.5"/>
              <path d="M 697,86 L 782,83 L 782,76 L 697,78 Z" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="0.9"/>
              {/* DRS slot */}
              <line x1="699" y1="80" x2="780" y2="77" stroke="rgba(0,210,170,0.16)" strokeWidth="0.8" strokeDasharray="4,6"/>
              {/* Diffuser */}
              <path d="M 697,151 L 784,155 L 784,170 L 697,164" fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="1.1"/>
              {/* Dimension lines */}
              <line x1="35"  y1="224" x2="722" y2="224" stroke="rgba(225,6,0,0.07)" strokeWidth="0.6" strokeDasharray="3,10"/>
              <line x1="35"  y1="218" x2="35"  y2="230" stroke="rgba(225,6,0,0.16)" strokeWidth="1"/>
              <line x1="722" y1="218" x2="722" y2="230" stroke="rgba(225,6,0,0.16)" strokeWidth="1"/>
              <text x="378" y="242" textAnchor="middle" fontFamily="monospace" fontSize="8.5" fill="rgba(225,6,0,0.18)" letterSpacing="2.5">WHEELBASE — 3,600 mm</text>
              {/* Ground clearance */}
              <line x1="180" y1="213" x2="180" y2="255" stroke="rgba(225,6,0,0.1)" strokeWidth="0.6"/>
              <line x1="170" y1="255" x2="190" y2="255" stroke="rgba(225,6,0,0.1)" strokeWidth="0.6"/>
              <text x="196" y="258" fontFamily="monospace" fontSize="6.5" fill="rgba(225,6,0,0.14)" letterSpacing="1.5">GND CLR 40mm</text>
              {/* Aero annotation callout lines */}
              <line x1="722" y1="105" x2="820" y2="88" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <line x1="820" y1="88" x2="860" y2="88" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <text x="822" y="85" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">REAR WING</text>
              <line x1="35" y1="140" x2="-40" y2="125" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <line x1="-40" y1="125" x2="-80" y2="125" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <text x="-148" y="122" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">NOSE CONE</text>
            </g>

            {/* ── Power unit components strip (bottom) ── */}
            <line x1="40" y1="846" x2="560" y2="846" stroke="rgba(225,6,0,0.07)" strokeWidth="0.5"/>
            <text x="40" y="859" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.2)" letterSpacing="2">ICE · MGU-H · MGU-K · ES · CE · TC</text>
            <text x="40" y="872" fontFamily="monospace" fontSize="5.5" fill="rgba(255,255,255,0.08)" letterSpacing="1.5">POWER UNIT: NOMINAL · ERS DEPLOY: 120kJ/lap</text>
            <line x1="40" y1="876" x2="560" y2="876" stroke="rgba(225,6,0,0.05)" strokeWidth="0.4"/>
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
          2026 SEASON · WIN REAL MONEY · NOW LIVE
        </p>

        {/* Sector indicator bars */}
        <div className="gl-login-sectors" aria-hidden="true">
          <span className="gl-login-sector gl-login-sector-1" />
          <span className="gl-login-sector gl-login-sector-2" />
          <span className="gl-login-sector gl-login-sector-3" />
        </div>

        <h1 className="gl-login-h1">
          Predict the podium.<br />
          Win real money.<br />
          <em>Or just watch someone else.</em>
        </h1>

        <p className="gl-login-sub">
          Pick the podium. Win USDC. Your rivals are already in.
        </p>

        <div className="gl-login-stats">
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">24</span>
            <span className="gl-login-stat-l">Rounds</span>
          </div>
          <div className="gl-login-stat-div" />
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">20</span>
            <span className="gl-login-stat-l">Rivals</span>
          </div>
          <div className="gl-login-stat-div" />
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">$</span>
            <span className="gl-login-stat-l">USDC Prizes</span>
          </div>
        </div>

        <button
          className="gl-login-btn"
          onClick={handleEnter}
          disabled={loading}
        >
          {loading ? <span className="gl-login-spinner" /> : "CLAIM YOUR SEAT"}
        </button>

        {error && <p className="gl-login-error">{error}</p>}

        <p className="gl-login-urgency">
          Every race you sit out is a prize you&apos;ll never collect.
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
