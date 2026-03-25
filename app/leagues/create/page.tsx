"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";

export default function CreateLeaguePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("private");
  const [entryFee] = useState("0");
  const [maxUsers, setMaxUsers] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        entry_fee_usdc: parseFloat(entryFee) || 0,
        max_users: parseInt(maxUsers) || 1000,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create league.");
      setLoading(false);
    } else {
      router.push(`/leagues/${data.league.id}`);
    }
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav />

      <div className="gla-content" style={{ maxWidth: "520px" }}>
        <Link href="/leagues" className="predict-back" style={{ display: "block", marginBottom: "1.5rem" }}>
          ← Leagues
        </Link>
        <p className="gla-page-title">Create League</p>
        <p className="gla-page-sub">Set up your private competition</p>

        <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: "2rem" }}>
          <label className="auth-label">
            League Name
            <input
              className="auth-input"
              placeholder="e.g. Office Grid Warriors"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={50}
            />
          </label>

          <label className="auth-label">
            Type
            <div className="league-type-toggle">
              <button
                type="button"
                className={`league-type-btn${type === "private" ? " is-active" : ""}`}
                onClick={() => setType("private")}
              >
                🔒 Private
              </button>
              <button
                type="button"
                className={`league-type-btn${type === "public" ? " is-active" : ""}`}
                onClick={() => setType("public")}
              >
                🌍 Public
              </button>
            </div>
          </label>

          <label className="auth-label">
            Entry Fee (USDC)
            <input
              className="auth-input"
              type="number"
              value="0"
              disabled
              style={{ opacity: 0.4, cursor: "not-allowed" }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--gl-muted, #888)" }}>
              Paid entry coming soon — all leagues are free during beta
            </span>
          </label>

          <label className="auth-label">
            Max Members
            <input
              className="auth-input"
              type="number"
              min="2"
              max="1000"
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
            />
          </label>

          {error && <p className="predict-error">{error}</p>}

          <button type="submit" className="gla-predict-submit" disabled={loading || !name.trim()}>
            {loading ? "Creating..." : "Create League"}
          </button>
        </form>
      </div>
    </div>
  );
}
