"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? "/dashboard";

  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showBetaNotice, setShowBetaNotice] = useState(false);

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
      setShowBetaNotice(true);
      setTimeout(() => router.push(redirect), 2000);
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

        {showBetaNotice && (
          <div style={{ marginTop: "1.5rem", padding: "0.875rem 1rem", borderRadius: "8px", background: "rgba(232,0,45,0.1)", border: "1px solid rgba(232,0,45,0.25)", fontSize: "0.875rem", color: "rgba(255,255,255,0.85)", textAlign: "left" }}>
            <strong style={{ color: "var(--gl-red)" }}>₮100 Test USDC credited.</strong>{" "}
            You&apos;ve been credited 100 Test USDC to use during the Gridlock beta. This is not real money — explore freely.
          </div>
        )}

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
