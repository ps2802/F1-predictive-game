"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? "/dashboard";

  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/login");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to save username.");
      setSaving(false);
    } else {
      track("onboarding_completed", { username });
      setOnboardingComplete(true);
      setTimeout(() => router.push(redirect), 3000);
    }
  }

  function handleSkip() {
    router.push(redirect);
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <div className="gla-content" style={{ maxWidth: "480px", textAlign: "center", paddingTop: "6rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏎️</div>
        <h1 className="gla-page-title">Choose your driver name</h1>
        <p className="gla-page-sub">
          This is how you&apos;ll appear on leaderboards. You can change it anytime.
        </p>

        {onboardingComplete && (
          <div style={{
            marginTop: "1.5rem",
            padding: "1.25rem 1.25rem",
            borderRadius: "10px",
            background: "rgba(0,210,170,0.08)",
            border: "1px solid rgba(0,210,170,0.3)",
            textAlign: "left",
          }}>
            <p style={{ fontSize: "1rem", fontWeight: 700, color: "rgba(0,210,170,1)", marginBottom: "0.5rem" }}>
              Welcome to Gridlock, {username}!
            </p>
            <p style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.8)", lineHeight: 1.6, margin: 0 }}>
              Gridlock is the F1 prediction game where you call the podium before every race —
              1st, 2nd, and 3rd. Nail the exact positions, score big. Miss by one spot, still
              earn points. The sharpest strategist on the leaderboard wins the prize pool.
            </p>
            <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.45)", marginTop: "0.75rem", marginBottom: 0 }}>
              ₮100 Test USDC credited. Explore leagues, make your first prediction, and get
              ready for 2026 lights out.
            </p>
          </div>
        )}

        {!onboardingComplete && (
          <form onSubmit={handleSubmit} style={{ marginTop: "2rem", textAlign: "left" }}>
            <input
              className="auth-input"
              placeholder="e.g. LewisH44"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={2}
              maxLength={30}
              autoFocus
            />
            {error && (
              <p style={{ color: "var(--gl-red)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button
                type="submit"
                className="gla-race-btn"
                style={{ flex: 1 }}
                disabled={saving || username.trim().length < 2}
              >
                {saving ? "Saving..." : "Set Username"}
              </button>
              <button
                type="button"
                className="gla-race-btn"
                style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}
                onClick={handleSkip}
              >
                Skip
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingForm />
    </Suspense>
  );
}
