"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { handlePrivyAuthComplete } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { buildFallbackNextRace } from "@/lib/races";

type NextRace = {
  id: string;
  round: number;
  grand_prix_name: string;
  qualifying_starts_at: string | null;
  race_starts_at: string | null;
};

type SeasonSummary = {
  totalRounds?: number;
};

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function calcTimeLeft(targetIso: string): TimeLeft {
  const diff = Math.max(0, new Date(targetIso).getTime() - Date.now());

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function NextRaceCountdownCard() {
  const [nextRace, setNextRace] = useState<NextRace | null>(null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function loadNextRace() {
      try {
        const res = await fetch("/api/races/next", { cache: "no-store" });
        const data = (await res.json()) as { race?: NextRace | null };
        const race = data.race ?? buildFallbackNextRace();
        if (cancelled || !race) {
          return;
        }

        setNextRace(race);
        const targetIso = race.qualifying_starts_at ?? race.race_starts_at;
        if (!targetIso) {
          return;
        }

        setTimeLeft(calcTimeLeft(targetIso));
        intervalId = setInterval(() => {
          setTimeLeft(calcTimeLeft(targetIso));
        }, 1000);
      } catch {
        const race = buildFallbackNextRace();
        if (cancelled || !race) {
          return;
        }

        setNextRace(race);
        const targetIso = race.qualifying_starts_at ?? race.race_starts_at;
        if (!targetIso) {
          return;
        }

        setTimeLeft(calcTimeLeft(targetIso));
        intervalId = setInterval(() => {
          setTimeLeft(calcTimeLeft(targetIso));
        }, 1000);
      }
    }

    void loadNextRace();

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  if (!nextRace || !timeLeft) {
    return null;
  }

  const targetIso = nextRace.qualifying_starts_at ?? nextRace.race_starts_at;
  if (!targetIso) {
    return null;
  }

  const dateLabel = new Date(targetIso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="home-countdown-box gl-login-countdown-box">
      <p className="home-countdown-label">
        <span className="home-countdown-dot" aria-hidden="true" />
        NEXT RACE - QUALIFYING LOCKS IN
      </p>
      <p className="home-countdown-race">{nextRace.grand_prix_name}</p>
      <p className="home-countdown-date">{dateLabel} · Round {nextRace.round}</p>
      <div className="home-countdown-timer" aria-live="polite" aria-atomic="true">
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.days)}</span>
          <span className="home-countdown-u">Days</span>
        </div>
        <span className="home-countdown-sep" aria-hidden="true">:</span>
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.hours)}</span>
          <span className="home-countdown-u">Hrs</span>
        </div>
        <span className="home-countdown-sep" aria-hidden="true">:</span>
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.minutes)}</span>
          <span className="home-countdown-u">Min</span>
        </div>
        <span className="home-countdown-sep" aria-hidden="true">:</span>
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.seconds)}</span>
          <span className="home-countdown-u">Sec</span>
        </div>
      </div>
    </div>
  );
}

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
  const [totalRounds, setTotalRounds] = useState<number | null>(null);

  useEffect(() => {
    track("login_viewed");

    let cancelled = false;

    async function loadSeasonSummary() {
      try {
        const res = await fetch("/api/races/summary?season=2026", {
          cache: "no-store",
        });

        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as SeasonSummary;
        if (!cancelled && typeof data.totalRounds === "number") {
          setTotalRounds(data.totalRounds);
        }
      } catch {
        // Leave the stat unresolved if the live summary request fails.
      }
    }

    void loadSeasonSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  const onComplete = useCallback(
    async () => {
      setError(null);
      try {
        await handlePrivyAuthComplete(getAccessToken, redirect, router);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sign-in failed.";
        track("auth_failed", {
          error_category: msg.includes("fetch") ? "network" : "sync",
        });
        setError(msg.includes("fetch") ? "Network error — please try again." : msg);
        setLoading(false);
      }
    },
    [getAccessToken, redirect, router]
  );

  const onError = useCallback((error: string) => {
    // User dismissed the modal — not an error
    if (error === "exited_auth_flow") {
      setLoading(false);
      return;
    }
    track("auth_failed", { error_category: "privy_modal" });
    setError("Sign-in failed. Please try again.");
    setLoading(false);
  }, []);

  const { login } = useLogin({ onComplete, onError });

  const handleEnter = () => {
    setLoading(true);
    setError(null);
    track("auth_started", {
      already_authenticated: authenticated,
      redirect_to: redirect ?? undefined,
    });
    // If already authenticated with Privy (existing session), skip the modal
    // and go straight to the Supabase sync — calling login() when already
    // authenticated causes Privy to throw "user is already logged in".
    if (authenticated) {
      handlePrivyAuthComplete(getAccessToken, redirect, router).catch((err) => {
        const msg = err instanceof Error ? err.message : "Sign-in failed.";
        track("auth_failed", {
          error_category: msg.includes("fetch") ? "network" : "sync",
        });
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

            {/* ── 2022-2026 ERA F1 CAR — ground effect, 18" wheels, central pylon ── */}
            <g transform="translate(18, 490) scale(0.66)">

              {/* Body fill */}
              <path d="M 22,232 C 65,226 115,210 155,193 C 175,185 196,170 218,158 C 232,149 246,141 261,132 C 282,115 304,108 322,110 C 342,113 362,128 382,135 L 386,135 L 386,97 C 398,91 452,88 494,88 C 537,88 570,95 600,108 C 624,118 644,130 662,140 L 730,152 C 718,163 700,177 680,194 C 655,215 628,225 596,227 L 210,230 C 195,232 178,234 162,237 C 138,241 80,242 22,238 Z"
                    fill="rgba(225,6,0,0.04)" stroke="none"/>

              {/* Upper body profile */}
              <path d="M 22,232 C 65,226 115,210 155,193 C 175,185 196,170 218,158 C 232,149 246,141 261,132 C 282,115 304,108 322,110 C 342,113 362,128 382,135 L 386,135 L 386,97 C 398,91 452,88 494,88 C 537,88 570,95 600,108 C 624,118 644,130 662,140 L 668,140"
                    fill="none" stroke="rgba(225,6,0,0.3)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>

              {/* Lower body / floor line */}
              <path d="M 22,238 C 80,242 138,240 162,237 C 178,234 195,232 210,230 L 596,227"
                    fill="none" stroke="rgba(225,6,0,0.3)" strokeWidth="1.6" strokeLinecap="round"/>

              {/* ── DIFFUSER — large, prominent in ground effect era ── */}
              <path d="M 596,227 C 628,225 655,215 680,194 C 700,177 718,163 730,152"
                    fill="none" stroke="rgba(225,6,0,0.3)" strokeWidth="1.6" strokeLinecap="round"/>
              {/* Diffuser internal channels */}
              <path d="M 612,222 C 638,220 662,208 682,190" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <path d="M 626,218 C 650,215 672,203 690,185" fill="none" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>

              {/* ── COCKPIT + HALO ── */}
              {/* Cockpit opening */}
              <path d="M 248,144 Q 270,128 305,120 Q 340,114 370,130 L 382,136"
                    fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="1.2"/>
              {/* Halo glow */}
              <path d="M 256,138 Q 292,107 322,108 Q 352,109 372,127"
                    fill="none" stroke="rgba(225,6,0,0.08)" strokeWidth="8" strokeLinecap="round"/>
              {/* Halo structure */}
              <path d="M 256,138 Q 292,107 322,108 Q 352,109 372,127"
                    fill="none" stroke="rgba(225,6,0,0.26)" strokeWidth="3" strokeLinecap="round"/>
              {/* Halo front leg (distinctive Y-shape) */}
              <line x1="268" y1="134" x2="270" y2="156" stroke="rgba(225,6,0,0.2)" strokeWidth="1.8" strokeLinecap="round"/>

              {/* ── AIR INTAKE BOX (tall, rectangular — 2022+ style) ── */}
              {/* Intake box top face */}
              <path d="M 386,97 C 398,91 452,88 494,88" fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="1.2"/>
              {/* Intake inlet opening face */}
              <path d="M 386,97 L 386,138" fill="none" stroke="rgba(225,6,0,0.22)" strokeWidth="1.2"/>
              {/* Intake box right side */}
              <line x1="494" y1="88" x2="496" y2="135" stroke="rgba(225,6,0,0.16)" strokeWidth="1"/>

              {/* ── SIDEPOD UNDERCUT — key 2022+ visual ── */}
              {/* Sidepod undercut curve (open space below sidepod) */}
              <path d="M 386,178 Q 425,185 462,200 Q 500,215 540,225 Q 568,228 596,227"
                    fill="none" stroke="rgba(225,6,0,0.2)" strokeWidth="1.3"/>
              {/* Sidepod leading edge inlet */}
              <path d="M 383,140 C 383,155 383,168 383,178" fill="none" stroke="rgba(225,6,0,0.2)" strokeWidth="1"/>

              {/* ── FLOOR EDGES (prominent aero element in ground effect era) ── */}
              <path d="M 210,230 L 596,227" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="1.4"/>
              {/* Floor edge micro-steps */}
              <line x1="280" y1="228" x2="280" y2="233" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8"/>
              <line x1="360" y1="227" x2="360" y2="232" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8"/>
              <line x1="440" y1="227" x2="440" y2="232" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8"/>
              <line x1="520" y1="227" x2="520" y2="232" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8"/>

              {/* ── FRONT WHEEL — 18" era: thin sidewall, big rim, disc cover ── */}
              {/* Outer tyre */}
              <circle cx="185" cy="197" r="40" fill="rgba(0,0,0,0.55)" stroke="rgba(225,6,0,0.26)" strokeWidth="1.6"/>
              {/* 18" = thin sidewall — rim is close to outer tyre */}
              <circle cx="185" cy="197" r="31" fill="rgba(10,0,0,0.4)" stroke="rgba(225,6,0,0.15)" strokeWidth="1"/>
              {/* Disc cover (2022+ all cars have wheel covers) */}
              <circle cx="185" cy="197" r="29" fill="rgba(225,6,0,0.04)" stroke="rgba(225,6,0,0.2)" strokeWidth="0.9"/>
              {/* Rim centre */}
              <circle cx="185" cy="197" r="10" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="1"/>
              {/* 5-spoke rim pattern */}
              <line x1="185" y1="168" x2="185" y2="187" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="185" y1="207" x2="185" y2="226" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="156" y1="197" x2="175" y2="197" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="195" y1="197" x2="214" y2="197" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="164" y1="176" x2="178" y2="190" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>
              <line x1="192" y1="204" x2="206" y2="218" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>
              <line x1="206" y1="176" x2="192" y2="190" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>
              <line x1="164" y1="218" x2="178" y2="204" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>

              {/* Front suspension (pushrod) */}
              <path d="M 155,183 L 115,166 M 216,183 L 242,166" stroke="rgba(225,6,0,0.18)" strokeWidth="1" fill="none"/>
              <path d="M 158,210 L 115,198 M 213,210 L 242,198" stroke="rgba(225,6,0,0.18)" strokeWidth="1" fill="none"/>
              {/* Pushrod */}
              <line x1="200" y1="186" x2="220" y2="166" stroke="rgba(225,6,0,0.13)" strokeWidth="0.9"/>

              {/* ── REAR WHEEL — 18" era ── */}
              <circle cx="658" cy="198" r="42" fill="rgba(0,0,0,0.55)" stroke="rgba(225,6,0,0.26)" strokeWidth="1.6"/>
              <circle cx="658" cy="198" r="33" fill="rgba(10,0,0,0.4)" stroke="rgba(225,6,0,0.15)" strokeWidth="1"/>
              <circle cx="658" cy="198" r="31" fill="rgba(225,6,0,0.04)" stroke="rgba(225,6,0,0.2)" strokeWidth="0.9"/>
              <circle cx="658" cy="198" r="11" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="1"/>
              <line x1="658" y1="167" x2="658" y2="187" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="658" y1="209" x2="658" y2="229" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="627" y1="198" x2="647" y2="198" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="669" y1="198" x2="689" y2="198" stroke="rgba(225,6,0,0.12)" strokeWidth="1"/>
              <line x1="636" y1="176" x2="650" y2="189" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>
              <line x1="666" y1="207" x2="680" y2="220" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>
              <line x1="680" y1="176" x2="666" y2="189" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>
              <line x1="636" y1="220" x2="650" y2="207" stroke="rgba(225,6,0,0.09)" strokeWidth="0.8"/>

              {/* Rear suspension (pullrod) */}
              <path d="M 618,184 L 574,164 M 698,184 L 722,164" stroke="rgba(225,6,0,0.18)" strokeWidth="1" fill="none"/>
              <path d="M 620,212 L 574,200 M 696,212 L 722,200" stroke="rgba(225,6,0,0.18)" strokeWidth="1" fill="none"/>
              {/* Pullrod (goes down from outboard) */}
              <line x1="622" y1="192" x2="606" y2="210" stroke="rgba(225,6,0,0.13)" strokeWidth="0.9"/>

              {/* ── FRONT WING — 2022+ simplified, 4-element, very close to ground ── */}
              {/* Endplates (straight, clean 2022+ style) */}
              <line x1="10" y1="227" x2="10" y2="248" stroke="rgba(225,6,0,0.24)" strokeWidth="1.1"/>
              <line x1="152" y1="224" x2="152" y2="248" stroke="rgba(225,6,0,0.24)" strokeWidth="1.1"/>
              {/* Neutral section (centre — flat, connects to nose) */}
              <path d="M 10,244 L 152,242" fill="none" stroke="rgba(225,6,0,0.32)" strokeWidth="1.5"/>
              {/* Flap 1 */}
              <path d="M 12,239 L 150,237" fill="none" stroke="rgba(225,6,0,0.24)" strokeWidth="1"/>
              {/* Flap 2 */}
              <path d="M 14,234 L 148,232" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="0.9"/>
              {/* Flap 3 (outer) */}
              <path d="M 16,229 L 146,227" fill="none" stroke="rgba(225,6,0,0.14)" strokeWidth="0.8"/>
              {/* Wing mount pylons (2 small pylons) */}
              <line x1="58" y1="238" x2="68" y2="229" stroke="rgba(225,6,0,0.14)" strokeWidth="0.9"/>
              <line x1="108" y1="238" x2="98" y2="229" stroke="rgba(225,6,0,0.14)" strokeWidth="0.9"/>

              {/* ── REAR WING — 2022+ HIGH-MOUNTED with SLIM CENTRAL PYLON ── */}
              {/* Endplates */}
              <line x1="672" y1="50" x2="672" y2="138" stroke="rgba(225,6,0,0.22)" strokeWidth="1.1"/>
              <line x1="760" y1="50" x2="760" y2="138" stroke="rgba(225,6,0,0.22)" strokeWidth="1.1"/>
              {/* Main plane - curved slightly like real car */}
              <path d="M 670,68 Q 716,58 762,66" fill="rgba(225,6,0,0.04)" stroke="rgba(225,6,0,0.34)" strokeWidth="1.5"/>
              {/* Main plane lower face */}
              <path d="M 670,77 Q 716,68 762,76" fill="none" stroke="rgba(225,6,0,0.18)" strokeWidth="0.9"/>
              {/* Upper flap */}
              <path d="M 672,60 Q 716,51 760,59" fill="rgba(225,6,0,0.03)" stroke="rgba(225,6,0,0.26)" strokeWidth="1.2"/>
              {/* DRS slot */}
              <path d="M 674,64 Q 716,55 758,63" fill="none" stroke="rgba(0,210,170,0.2)" strokeWidth="0.8" strokeDasharray="4,5"/>
              {/* ★ SLIM CENTRAL PYLON — most distinctive 2022+ feature ★ */}
              <rect x="712" y="76" width="8" height="64" rx="2"
                    fill="rgba(225,6,0,0.06)" stroke="rgba(225,6,0,0.3)" strokeWidth="1.1"/>
              {/* ★ BEAM WING — second lower element, new in 2022+ ★ */}
              <path d="M 675,130 Q 716,126 757,129" fill="rgba(225,6,0,0.03)" stroke="rgba(225,6,0,0.28)" strokeWidth="1.3"/>
              <path d="M 676,135 Q 716,132 756,135" fill="none" stroke="rgba(225,6,0,0.14)" strokeWidth="0.8"/>

              {/* ── TECHNICAL DIMENSIONS ── */}
              <line x1="22" y1="272" x2="730" y2="272" stroke="rgba(225,6,0,0.07)" strokeWidth="0.6" strokeDasharray="3,10"/>
              <line x1="22" y1="266" x2="22" y2="278" stroke="rgba(225,6,0,0.14)" strokeWidth="0.9"/>
              <line x1="730" y1="266" x2="730" y2="278" stroke="rgba(225,6,0,0.14)" strokeWidth="0.9"/>
              <text x="376" y="286" textAnchor="middle" fontFamily="monospace" fontSize="8" fill="rgba(225,6,0,0.16)" letterSpacing="2">LENGTH — 5,634 mm</text>
              {/* Wheelbase */}
              <line x1="185" y1="258" x2="658" y2="258" stroke="rgba(225,6,0,0.06)" strokeWidth="0.5" strokeDasharray="2,8"/>
              <line x1="185" y1="253" x2="185" y2="263" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8"/>
              <line x1="658" y1="253" x2="658" y2="263" stroke="rgba(225,6,0,0.12)" strokeWidth="0.8"/>
              <text x="421" y="267" textAnchor="middle" fontFamily="monospace" fontSize="7" fill="rgba(225,6,0,0.13)" letterSpacing="1.5">WB — 3,600 mm</text>
              {/* Ground clearance — 2022+ cars run very low */}
              <line x1="185" y1="237" x2="185" y2="252" stroke="rgba(225,6,0,0.1)" strokeWidth="0.6"/>
              <line x1="178" y1="252" x2="192" y2="252" stroke="rgba(225,6,0,0.1)" strokeWidth="0.6"/>
              <text x="198" y="254" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">GND CLR 15mm</text>

              {/* Annotation callouts */}
              <line x1="716" y1="58" x2="800" y2="38" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <line x1="800" y1="38" x2="840" y2="38" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <text x="842" y="35" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">REAR WING</text>
              <line x1="716" y1="130" x2="800" y2="148" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <line x1="800" y1="148" x2="840" y2="148" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <text x="842" y="145" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">BEAM WING</text>
              <line x1="716" y1="108" x2="800" y2="93" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <line x1="800" y1="93" x2="840" y2="93" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <text x="842" y="90" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">PYLON</text>
              <line x1="22" y1="232" x2="-50" y2="215" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <line x1="-50" y1="215" x2="-90" y2="215" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <text x="-158" y="212" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">NOSE CONE</text>
              <line x1="450" y1="210" x2="450" y2="228" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <line x1="450" y1="228" x2="390" y2="228" stroke="rgba(225,6,0,0.1)" strokeWidth="0.7"/>
              <text x="296" y="225" fontFamily="monospace" fontSize="6" fill="rgba(225,6,0,0.14)" letterSpacing="1">SIDEPOD UNDERCUT</text>
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
          <em>Win real money.</em>
        </h1>

        <p className="gl-login-sub">
          Pick the podium. Win USDC. Your rivals are already in.
        </p>

        <NextRaceCountdownCard />

        <div className="gl-login-stats">
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">{totalRounds ?? "--"}</span>
            <span className="gl-login-stat-l">Rounds</span>
          </div>
          <div className="gl-login-stat-div" />
          <div className="gl-login-stat">
            <span className="gl-login-stat-n">22</span>
            <span className="gl-login-stat-l">Drivers</span>
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
