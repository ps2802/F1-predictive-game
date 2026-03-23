"use client";

import Link from "next/link";
import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePrivy, useLogin, type User } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
    console.error("[privy-sync] failed:", await res.text());
    throw new Error("privy-sync failed");
  }

  const { token, email } = await res.json();

  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    throw new Error(
      "Supabase client not configured — check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    console.error("[Supabase] verifyOtp failed:", error.message);
    throw new Error(error.message);
  }

  if (redirectTo) {
    router.push(redirectTo);
    return;
  }

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

/** 2026 F1 calendar — used for the scrolling circuit ticker */
const CIRCUITS = [
  "BAHRAIN", "JEDDAH", "MELBOURNE", "SUZUKA", "SHANGHAI",
  "MIAMI", "IMOLA", "MONACO", "MONTRÉAL", "BARCELONA",
  "SPIELBERG", "SILVERSTONE", "BUDAPEST", "SPA", "ZANDVOORT",
  "MONZA", "BAKU", "SINGAPORE", "AUSTIN", "MEXICO CITY",
  "SÃO PAULO", "LAS VEGAS", "LUSAIL", "ABU DHABI",
];

function CircuitTicker() {
  // Duplicate for seamless loop
  const items = [...CIRCUITS, ...CIRCUITS];
  return (
    <div className="gl-ticker-wrap" aria-hidden="true">
      <div className="gl-ticker-track">
        {items.map((c, i) => (
          <span key={i} className="gl-ticker-item">
            <span className="gl-ticker-flag">⬛🏁</span>
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? null;

  const { getAccessToken } = usePrivy();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onComplete = useCallback(
    async ({ user }: { user: User }) => {
      console.log("[Privy] login complete:", user.id);
      setError(null);
      try {
        await handlePrivyLoginComplete(getAccessToken, redirect, router);
      } catch (err) {
        console.error("[Privy] post-login sync failed:", err);
        setError("Sign-in failed. Please try again.");
        setLoading(false);
      }
    },
    [getAccessToken, redirect, router]
  );

  const onError = useCallback((err: unknown) => {
    console.error("[Privy] login error:", err);
    setError("Sign-in failed. Please try again.");
    setLoading(false);
  }, []);

  const { login } = useLogin({ onComplete, onError });

  const handleLogin = () => {
    setLoading(true);
    login();
  };

  return (
    <div className="gl-login-root">

      {/* ── Left: Content panel ── */}
      <div className="gl-login-panel">

        {/* Checkered flag accent strip across top */}
        <div className="gl-login-checker-top" aria-hidden="true" />

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="gl-login-logo"
          draggable={false}
        />

        {/* Live badge */}
        <p className="gl-login-eyebrow">
          <span className="gl-login-dot" />
          2026 SEASON · NOW LIVE
        </p>

        {/* Headline */}
        <h1 className="gl-login-h1">
          Predict.<br />
          Win.<br />
          <em>Get paid.</em>
        </h1>

        {/* Dark psychology sub-copy with money angle */}
        <p className="gl-login-sub">
          Real money. Real stakes. Real F1.<br />
          Call the podium right and you walk away
          with cash — not just bragging rights.
          Most players won&apos;t finish top 10.
          Most players never do.
        </p>

        {/* Prize pot callout — scarcity + loss aversion */}
        <div className="gl-login-prize-box">
          <div className="gl-login-prize-left">
            <span className="gl-login-prize-label">SEASON PRIZE POT</span>
            <span className="gl-login-prize-amount">£2,400</span>
          </div>
          <div className="gl-login-prize-right">
            <span className="gl-login-prize-warn">
              Last round ended.<br />
              You weren&apos;t there.
            </span>
          </div>
        </div>

        {/* Sector-style stats row */}
        <div className="gl-login-stats">
          <div className="gl-login-stat">
            <span className="gl-login-stat-sector">S1</span>
            <span className="gl-login-stat-n">24</span>
            <span className="gl-login-stat-l">Rounds</span>
          </div>
          <div className="gl-login-stat-div" />
          <div className="gl-login-stat">
            <span className="gl-login-stat-sector">S2</span>
            <span className="gl-login-stat-n">20</span>
            <span className="gl-login-stat-l">Drivers</span>
          </div>
          <div className="gl-login-stat-div" />
          <div className="gl-login-stat">
            <span className="gl-login-stat-sector">S3</span>
            <span className="gl-login-stat-n">1</span>
            <span className="gl-login-stat-l">Champion</span>
          </div>
        </div>

        {/* CTA */}
        <button
          className="gl-login-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? <span className="gl-login-spinner" /> : (
            <>
              <span className="gl-login-btn-flag" aria-hidden="true">🏁</span>
              ENTER THE GRID
            </>
          )}
        </button>

        {error && <p className="gl-login-error">{error}</p>}

        {/* Loss aversion micro-copy */}
        <p className="gl-login-urgency">
          Every race without a prediction is money left on the grid.
        </p>

        {/* Footer */}
        <div className="gl-login-footer">
          No account? <Link href="/signup">Join the grid — it&apos;s free</Link>
        </div>

      </div>

      {/* ── Right: Driver hero image (flipped) ── */}
      <div className="gl-login-visual" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock f1 driver .png"
          alt=""
          className="gl-login-driver"
          draggable={false}
        />

        {/* Speed lines overlay */}
        <div className="gl-login-speedlines" />

        {/* Dark gradient blending into content panel */}
        <div className="gl-login-img-overlay" />

        {/* Vertical red glow strip on left edge (bridges panels) */}
        <div className="gl-login-vstrip" />

        {/* Circuit ticker at bottom of image */}
        <CircuitTicker />

        {/* DRS zone badge */}
        <div className="gl-login-drs-badge">
          <span className="gl-login-drs-label">DRS</span>
          <span className="gl-login-drs-status">OPEN</span>
        </div>

        {/* Lap counter decoration */}
        <div className="gl-login-lap">
          <span className="gl-login-lap-label">LAP</span>
          <span className="gl-login-lap-n">1 / 24</span>
        </div>
      </div>

    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
