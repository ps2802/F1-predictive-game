"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";

const PRESET_FEES = [0, 5, 10, 20, 25];
const DEFAULT_TIERS = [
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
];

export default function CreateLeaguePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("private");
  const [entryFee, setEntryFee] = useState(0);
  const [maxUsers, setMaxUsers] = useState("1000");
  const [payoutTiers, setPayoutTiers] = useState(DEFAULT_TIERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalPercent = payoutTiers.reduce((sum, t) => sum + t.percent, 0);

  function updateTier(index: number, percent: number) {
    setPayoutTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, percent } : t))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (entryFee > 0 && totalPercent !== 100) {
      setError("Payout percentages must add up to 100%.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        entry_fee_usdc: entryFee,
        max_users: parseInt(maxUsers) || 1000,
        payout_config: entryFee > 0 ? { tiers: payoutTiers } : null,
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
        <p className="gla-page-sub">Set up your competition</p>

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
                Private
              </button>
              <button
                type="button"
                className={`league-type-btn${type === "public" ? " is-active" : ""}`}
                onClick={() => setType("public")}
              >
                Public
              </button>
            </div>
          </label>

          <label className="auth-label">
            Entry Fee (USDC)
            <div className="league-fee-presets">
              {PRESET_FEES.map((fee) => (
                <button
                  key={fee}
                  type="button"
                  className={`league-fee-btn${entryFee === fee ? " is-active" : ""}`}
                  onClick={() => setEntryFee(fee)}
                >
                  {fee === 0 ? "Free" : `$${fee}`}
                </button>
              ))}
            </div>
          </label>

          {/* Payout distribution — only shown for paid leagues */}
          {entryFee > 0 && (
            <div className="auth-label">
              <span>Payout Distribution</span>
              <div className="league-payout-editor">
                {payoutTiers.map((tier, i) => (
                  <div key={tier.place} className="league-payout-edit-row">
                    <span className="league-payout-place-label">
                      {tier.place === 1 ? "1st" : tier.place === 2 ? "2nd" : "3rd"}
                    </span>
                    <input
                      className="auth-input"
                      type="number"
                      min={0}
                      max={100}
                      value={tier.percent}
                      onChange={(e) => updateTier(i, parseInt(e.target.value) || 0)}
                      style={{ width: "80px", textAlign: "center" }}
                    />
                    <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)" }}>%</span>
                  </div>
                ))}
                {totalPercent !== 100 && (
                  <p style={{ fontSize: "0.75rem", color: "var(--gl-red)", marginTop: "0.5rem" }}>
                    Total: {totalPercent}% — must equal 100%
                  </p>
                )}
              </div>
            </div>
          )}

          <label className="auth-label">
            Max Members
            <input
              className="auth-input"
              type="number"
              min="2"
              max="10000"
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
