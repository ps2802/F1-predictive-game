"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import { races } from "@/lib/races";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DEFAULT_TIERS = [
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
];

type ProfileData = {
  balance_usdc: number;
};

export default function CreateLeaguePage() {
  const router = useRouter();
  const defaultRaceId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("raceId") ??
        races.find((race) => race.status === "upcoming")?.id ??
        races[0]?.id ??
        ""
      : races.find((race) => race.status === "upcoming")?.id ?? races[0]?.id ?? "";
  const [raceId, setRaceId] = useState(defaultRaceId);
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("private");
  const [minimumStake] = useState(MINIMUM_LEAGUE_STAKE_USDC);
  const [creatorStake, setCreatorStake] = useState(String(MINIMUM_LEAGUE_STAKE_USDC));
  const [maxUsers, setMaxUsers] = useState("1000");
  const [payoutModel, setPayoutModel] = useState<"manual" | "skill_weighted">("manual");
  const [payoutTiers, setPayoutTiers] = useState(DEFAULT_TIERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(
    () => createSupabaseBrowserClient() !== null
  );

  const totalPercent = payoutTiers.reduce((sum, t) => sum + t.percent, 0);
  const creatorStakeAmount = Number(creatorStake) || 0;
  const balanceUsdc = Number(profile?.balance_usdc ?? 0);
  const hasInsufficientBalance =
    !profileLoading && creatorStakeAmount > 0 && creatorStakeAmount > balanceUsdc;
  const balanceShortfall = Math.max(0, creatorStakeAmount - balanceUsdc);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (cancelled) {
        return;
      }

      if (!user) {
        router.push("/login");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("balance_usdc")
        .eq("id", user.id)
        .single();

      if (!cancelled) {
        setProfile(data ?? { balance_usdc: 0 });
        setProfileLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

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

    if (hasInsufficientBalance) {
      setError(
        `You need $${balanceShortfall.toFixed(2)} more Test USDC to open this league.`
      );
      setLoading(false);
      return;
    }

    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        race_id: raceId,
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
      if ((data.error ?? "").includes("Insufficient balance")) {
        setError(
          `You need $${Math.max(0, creatorStakeAmount - balanceUsdc).toFixed(2)} more Test USDC to open this league.`
        );
      } else {
        setError(data.error ?? "Failed to create league.");
      }
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
              value={raceId}
              onChange={(e) => setRaceId(e.target.value)}
              required
            >
              {races
                .filter((race) => race.status === "upcoming")
                .map((race) => (
                  <option key={race.id} value={race.id}>
                    Round {race.round} · {race.name}
                  </option>
                ))}
            </select>
          </label>

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
            <p style={{ margin: "0.5rem 0 0", color: "rgba(255,255,255,0.58)", fontSize: "0.85rem" }}>
              {profileLoading
                ? "Loading your wallet balance..."
                : `Available balance: $${balanceUsdc.toFixed(2)} Test USDC`}
            </p>
          </label>

          {hasInsufficientBalance && (
            <div
              style={{
                border: "1px solid rgba(225, 6, 0, 0.4)",
                background: "rgba(225, 6, 0, 0.08)",
                borderRadius: "14px",
                padding: "0.9rem 1rem",
                marginTop: "-0.25rem",
              }}
            >
              <p style={{ color: "#ff7a7a", fontSize: "0.9rem", margin: 0 }}>
                You need ${balanceShortfall.toFixed(2)} more Test USDC to open this league.
              </p>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.82rem", margin: "0.45rem 0 0" }}>
                Reduce your opening stake or check your wallet balance before creating the league.
              </p>
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <Link href="/wallet" className="league-secondary-btn gla-race-btn">
                  Open Wallet
                </Link>
              </div>
            </div>
          )}

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
            disabled={loading || profileLoading || hasInsufficientBalance || !name.trim() || !raceId}
          >
            {loading ? "Creating..." : "Create League"}
          </button>
        </form>
      </div>
    </div>
  );
}
