"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import { useRaceCatalog } from "@/lib/raceCatalog";

const DEFAULT_TIERS = [
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
];

export default function CreateLeaguePage() {
  const router = useRouter();
  const { races, loading: racesLoading } = useRaceCatalog();
  const [raceId, setRaceId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("private");
  const [minimumStake] = useState(MINIMUM_LEAGUE_STAKE_USDC);
  const [creatorStake, setCreatorStake] = useState(String(MINIMUM_LEAGUE_STAKE_USDC));
  const [maxUsers, setMaxUsers] = useState("1000");
  const [payoutModel, setPayoutModel] = useState<"manual" | "skill_weighted">("manual");
  const [payoutTiers, setPayoutTiers] = useState(DEFAULT_TIERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalPercent = payoutTiers.reduce((sum, t) => sum + t.percent, 0);
  const selectableRaces = races.filter((race) => race.status === "upcoming");
  const requestedRaceId =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("raceId");
  const effectiveRaceId =
    raceId ||
    requestedRaceId ||
    selectableRaces[0]?.id ||
    races[0]?.id ||
    "";

  function updateTier(index: number, percent: number) {
    setPayoutTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, percent } : t))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (payoutModel === "manual" && totalPercent > 100) {
      setError("Payout percentages must add up to 100% or less.");
      setLoading(false);
      return;
    }

    if (Number(creatorStake) < minimumStake) {
      setError(`Your opening stake must be at least ${minimumStake} USDC.`);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        race_id: effectiveRaceId,
        type,
        minimum_stake_usdc: minimumStake,
        creator_stake_usdc: Number(creatorStake),
        max_users: parseInt(maxUsers) || 1000,
        payout_model: payoutModel,
        payout_config: payoutModel === "manual" ? { tiers: payoutTiers } : null,
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

      <div className="gla-content" style={{ maxWidth: "520px" }}>
        <Link href="/leagues" className="predict-back" style={{ display: "block", marginBottom: "1.5rem" }}>
          ← Leagues
        </Link>
        <p className="gla-page-title">Create League</p>
        <p className="gla-page-sub">Set up your competition</p>

        <form onSubmit={handleSubmit} className="auth-form" style={{ marginTop: "2rem" }}>
          <label className="auth-label">
            Race
            <select
              className="auth-input"
              value={effectiveRaceId}
              onChange={(e) => setRaceId(e.target.value)}
              required
              disabled={racesLoading || races.length === 0}
            >
              {(selectableRaces.length > 0 ? selectableRaces : races)
                .map((race) => (
                  <option key={race.id} value={race.id}>
                    Round {race.round} · {race.name}
                  </option>
                ))}
            </select>
          </label>

          {!racesLoading && races.length === 0 && (
            <p className="predict-error">No race schedule is available right now.</p>
          )}

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

          <div className="auth-label">
            <span>League Minimum Stake</span>
            <p style={{ margin: "0.5rem 0 0", color: "rgba(255,255,255,0.72)" }}>
              Every member chooses their own stake amount, but no one can enter below ${minimumStake} USDC.
            </p>
          </div>

          <label className="auth-label">
            Your Opening Stake (USDC)
            <input
              className="auth-input"
              type="number"
              min={minimumStake}
              step="1"
              value={creatorStake}
              onChange={(e) => setCreatorStake(e.target.value)}
            />
          </label>

          <label className="auth-label">
            Payout Model
            <div className="league-type-toggle">
              <button
                type="button"
                className={`league-type-btn${payoutModel === "skill_weighted" ? " is-active" : ""}`}
                onClick={() => setPayoutModel("skill_weighted")}
              >
                Fair
              </button>
              <button
                type="button"
                className={`league-type-btn${payoutModel === "manual" ? " is-active" : ""}`}
                onClick={() => setPayoutModel("manual")}
              >
                Custom
              </button>
            </div>
          </label>

          {payoutModel === "manual" && (
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
                {totalPercent > 100 && (
                  <p style={{ fontSize: "0.75rem", color: "var(--gl-red)", marginTop: "0.5rem" }}>
                    Total: {totalPercent}% — must be 100% or less
                  </p>
                )}
              </div>
            </div>
          )}

          {payoutModel === "skill_weighted" && (
            <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.68)", marginTop: "-0.25rem" }}>
              Fair payouts distribute the prize pool proportionally to final score. Zero-score entries receive nothing.
            </p>
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

          <button
            type="submit"
            className="gla-predict-submit"
            disabled={loading || racesLoading || !name.trim() || !effectiveRaceId}
          >
            {loading ? "Creating..." : "Create League"}
          </button>
        </form>
      </div>
    </div>
  );
}
