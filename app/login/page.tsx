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
        {/* Vertical red glow strip */}
        <div className="gl-login-vstrip" />
      </div>

      {/* ── Left: Content panel ── */}
      <div className="gl-login-panel">

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="gl-login-logo"
          draggable={false}
        />

        {/* Eyebrow */}
        <p className="gl-login-eyebrow">
          <span className="gl-login-dot" />
          2026 SEASON · NOW LIVE
        </p>

        {/* Headline — identity threat + exclusivity */}
        <h1 className="gl-login-h1">
          You either<br />
          see the grid<br />
          <em>— or you don&apos;t.</em>
        </h1>

        {/* Dark psychology sub-copy */}
        <p className="gl-login-sub">
          Opinions are free. Points aren&apos;t.<br />
          Predict qualifying, race results, and driver battles
          across 24 rounds. Your rivals placed last race.
          Did you?
        </p>

        {/* Stats row — social proof + loss aversion */}
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

        {/* CTA */}
        <button
          className="gl-login-btn"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? <span className="gl-login-spinner" /> : "ENTER THE GRID"}
        </button>

        {error && <p className="gl-login-error">{error}</p>}

        {/* Loss aversion micro-copy */}
        <p className="gl-login-urgency">
          Every race you sit out is a race you can never win back.
        </p>

        {/* Footer */}
        <div className="gl-login-footer">
          No account?{" "}
          <Link href="/signup">Join the grid</Link>
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
