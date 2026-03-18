"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? "/dashboard";

  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
      router.push(redirect);
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
