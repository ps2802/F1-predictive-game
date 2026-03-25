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
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      // Skip onboarding if user already has a username set (e.g. returning user
      // who was mis-routed here due to a stale auth check).
      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();
      if (prof?.username) {
        router.push(redirect);
      }
    });
  }, [router, redirect]);

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
      setDone(true);
    }
  }

  // Success state — show beta credits notice with an explicit CTA
  // (no auto-redirect: the 2-second timer was too fast to read the notice)
  if (done) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <div className="gla-content" style={{ maxWidth: "480px", textAlign: "center", paddingTop: "6rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏁</div>
          <h1 className="gla-page-title">You&apos;re in, {username}.</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>
            Your driver name is set. Time to predict.
          </p>
          <div style={{
            marginTop: "1.5rem",
            padding: "1rem 1.25rem",
            background: "rgba(232,0,45,0.08)",
            border: "1px solid rgba(232,0,45,0.2)",
            textAlign: "left",
          }}>
            <p style={{ fontSize: "0.9rem", color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--gl-red)" }}>₮100 Test USDC credited.</strong>{" "}
              This is not real money — use it to join paid leagues and explore the game freely during beta.
            </p>
          </div>
          <button
            className="gla-predict-submit"
            style={{ marginTop: "2rem", width: "100%" }}
            onClick={() => router.push(redirect)}
          >
            Go to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <div className="gla-content" style={{ maxWidth: "480px", textAlign: "center", paddingTop: "6rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏎️</div>
        <h1 className="gla-page-title">Choose your driver name</h1>
        <p className="gla-page-sub">
          This is how you&apos;ll appear on leaderboards. You can change it anytime from your profile.
        </p>

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
              onClick={() => router.push(redirect)}
            >
              Skip
            </button>
          </div>
        </form>
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
