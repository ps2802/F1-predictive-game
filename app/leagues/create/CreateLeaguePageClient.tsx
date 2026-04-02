"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import { track } from "@/lib/analytics";
import { useRaceCatalog } from "@/lib/raceCatalog";

const DEFAULT_TIERS = [
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
];

const ENTRY_FEE_PRESETS = [5, 10, 25, 50];

type CreateLeaguePageClientProps = {
  initialRaceId: string | null;
};

export default function CreateLeaguePageClient({
  initialRaceId,
}: CreateLeaguePageClientProps) {
  const router = useRouter();
  const { races, loading: racesLoading } = useRaceCatalog();
  const [step, setStep] = useState(1);
  const [raceId] = useState(initialRaceId ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<"public" | "private">("private");
  const [minimumStake] = useState(MINIMUM_LEAGUE_STAKE_USDC);
  const [creatorStake, setCreatorStake] = useState(String(MINIMUM_LEAGUE_STAKE_USDC));
  const [customFee, setCustomFee] = useState("");
  const [maxUsers, setMaxUsers] = useState("1000");
  const [payoutModel, setPayoutModel] = useState<"manual" | "skill_weighted">("manual");
  const [payoutTiers, setPayoutTiers] = useState(DEFAULT_TIERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalPercent = payoutTiers.reduce((sum, tier) => sum + tier.percent, 0);
  const selectableRaces = races.filter((race) => race.status === "upcoming");
  const effectiveRaceId = raceId || selectableRaces[0]?.id || races[0]?.id || "";

  useEffect(() => {
    track("league_create_started", { initial_race_id: initialRaceId ?? undefined });
  }, [initialRaceId]);

  function updateTier(index: number, percent: number) {
    setPayoutTiers((prev) =>
      prev.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, percent } : tier
      )
    );
  }

  // Sync creatorStake with customFee or preset when user changes fee
  function handlePresetSelect(amount: number) {
    setCustomFee("");
    setCreatorStake(String(amount));
  }

  function handleCustomFee(val: string) {
    setCustomFee(val);
    if (val && Number(val) >= minimumStake) {
      setCreatorStake(val);
    }
  }

  const selectedPreset = customFee === "" ? Number(creatorStake) : null;

  async function handleSubmit() {
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
        max_users: parseInt(maxUsers, 10) || 1000,
        payout_model: payoutModel,
        payout_config: payoutModel === "manual" ? { tiers: payoutTiers } : null,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to create league.");
      setLoading(false);
      return;
    }

    track(
      "league_created",
      { league_id: data.league?.id, payout_model: payoutModel, race_id: effectiveRaceId },
      { send_to_posthog: false, send_to_clarity: true }
    );

    router.push(`/leagues/${data.league.id}`);
  }

  const canProceedStep1 = name.trim().length > 0;
  const canProceedStep2 = true;
  const canProceedStep3 =
    Number(creatorStake) >= minimumStake &&
    !racesLoading &&
    races.length > 0;

  const selectedRaceName =
    selectableRaces.find((r) => r.id === effectiveRaceId)?.name ??
    races.find((r) => r.id === effectiveRaceId)?.name ??
    "—";

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />

      <div className="gla-content" style={{ maxWidth: "540px" }}>
        <Link href="/leagues" className="predict-back" style={{ display: "block", marginBottom: "1.5rem" }}>
          ← Leagues
        </Link>

        <p className="gla-page-title">Create League</p>
        <p className="gla-page-sub">Set up your F1 prediction league</p>

        {/* Wizard progress */}
        <div className="wizard-steps">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`wizard-step${step === n ? " is-active" : step > n ? " is-done" : ""}`}>
              <div className="wizard-step-dot">
                {step > n ? "✓" : n}
              </div>
              <span className="wizard-step-label">
                {n === 1 ? "Setup" : n === 2 ? "Payout" : n === 3 ? "Entry" : "Review"}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1: Name + Type */}
        {step === 1 && (
          <div className="wizard-panel">
            <div className="auth-form">
              <label className="auth-label">
                League Name
                <input
                  className="auth-input"
                  placeholder="e.g. Office Grid Warriors"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={50}
                  autoFocus
                />
              </label>

              <div className="auth-label" style={{ marginBottom: "0.5rem" }}>League Type</div>
              <div className="league-type-cards">
                <button
                  type="button"
                  className={`league-type-card${type === "public" ? " is-selected" : ""}`}
                  onClick={() => setType("public")}
                >
                  <span className="league-type-card-icon">🌍</span>
                  <strong className="league-type-card-title">Public</strong>
                  <span className="league-type-card-desc">Anyone can discover and join your league</span>
                </button>
                <button
                  type="button"
                  className={`league-type-card${type === "private" ? " is-selected" : ""}`}
                  onClick={() => setType("private")}
                >
                  <span className="league-type-card-icon">🔒</span>
                  <strong className="league-type-card-title">Private</strong>
                  <span className="league-type-card-desc">Invite only with a unique join code</span>
                </button>
              </div>

              <div className="wizard-nav">
                <span />
                <button
                  type="button"
                  className="gla-predict-submit"
                  disabled={!canProceedStep1}
                  onClick={() => setStep(2)}
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Payout model */}
        {step === 2 && (
          <div className="wizard-panel">
            <div className="auth-form">
              <div className="auth-label" style={{ marginBottom: "0.5rem" }}>Payout Structure</div>
              <div className="league-type-cards">
                <button
                  type="button"
                  className={`league-type-card${payoutModel === "manual" ? " is-selected" : ""}`}
                  onClick={() => setPayoutModel("manual")}
                >
                  <span className="league-type-card-icon">🏆</span>
                  <strong className="league-type-card-title">Manual Payout</strong>
                  <span className="league-type-card-desc">Set custom payout percentages for each position</span>
                </button>
                <button
                  type="button"
                  className={`league-type-card${payoutModel === "skill_weighted" ? " is-selected" : ""}`}
                  onClick={() => setPayoutModel("skill_weighted")}
                >
                  <span className="league-type-card-icon">⚖️</span>
                  <strong className="league-type-card-title">Fair Payout</strong>
                  <span className="league-type-card-desc">Payouts scale proportionally with score — rewards come through the season</span>
                </button>
              </div>

              {payoutModel === "manual" && (
                <div className="auth-label" style={{ marginTop: "1.5rem" }}>
                  <span>Distribution</span>
                  <div className="league-payout-editor" style={{ marginTop: "0.75rem" }}>
                    {payoutTiers.map((tier, index) => (
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
                          onChange={(e) => updateTier(index, parseInt(e.target.value, 10) || 0)}
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

              <div className="wizard-nav">
                <button type="button" className="gla-predict-cancel" onClick={() => setStep(1)}>← Back</button>
                <button
                  type="button"
                  className="gla-predict-submit"
                  disabled={!canProceedStep2}
                  onClick={() => setStep(3)}
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Entry fee */}
        {step === 3 && (
          <div className="wizard-panel">
            <div className="auth-form">
              <div className="auth-label" style={{ marginBottom: "0.5rem" }}>Entry Fee (USDC)</div>
              <div className="entry-fee-presets">
                {ENTRY_FEE_PRESETS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={`entry-fee-pill${selectedPreset === amount ? " is-selected" : ""}`}
                    onClick={() => handlePresetSelect(amount)}
                    disabled={amount < minimumStake}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
              <label className="auth-label" style={{ marginTop: "1rem" }}>
                Or enter custom amount
                <input
                  className="auth-input"
                  type="number"
                  min={minimumStake}
                  step="1"
                  value={customFee}
                  placeholder={`Min $${minimumStake}`}
                  onChange={(e) => handleCustomFee(e.target.value)}
                />
              </label>
              {Number(creatorStake) < minimumStake && (
                <p style={{ fontSize: "0.75rem", color: "#f87171", marginTop: "0.35rem" }}>
                  Minimum entry fee is ${minimumStake} USDC
                </p>
              )}

              <label className="auth-label" style={{ marginTop: "1.5rem" }}>
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

              {!racesLoading && races.length === 0 && (
                <p className="predict-error">No race schedule is available right now.</p>
              )}

              <div className="wizard-nav">
                <button type="button" className="gla-predict-cancel" onClick={() => setStep(2)}>← Back</button>
                <button
                  type="button"
                  className="gla-predict-submit"
                  disabled={!canProceedStep3}
                  onClick={() => setStep(4)}
                >
                  Continue →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="wizard-panel">
            <div className="wizard-review-card">
              <h3 className="wizard-review-name">{name}</h3>
              <span className={`league-card-type ${type}`}>{type}</span>

              <div className="wizard-review-grid">
                <div className="wizard-review-row">
                  <span className="wizard-review-label">Entry Fee</span>
                  <span className="wizard-review-val">${Number(creatorStake).toFixed(0)} USDC</span>
                </div>
                <div className="wizard-review-row">
                  <span className="wizard-review-label">Max Players</span>
                  <span className="wizard-review-val">{maxUsers}</span>
                </div>
                <div className="wizard-review-row">
                  <span className="wizard-review-label">Payout Model</span>
                  <span className="wizard-review-val">
                    {payoutModel === "skill_weighted" ? "Fair (Weighted)" : "Manual"}
                  </span>
                </div>
                {payoutModel === "manual" && (
                  <div className="wizard-review-row">
                    <span className="wizard-review-label">Distribution</span>
                    <span className="wizard-review-val">
                      {payoutTiers.map((t) => `${t.percent}%`).join(" / ")}
                    </span>
                  </div>
                )}
                <div className="wizard-review-row">
                  <span className="wizard-review-label">Race</span>
                  <span className="wizard-review-val">{selectedRaceName}</span>
                </div>
              </div>
            </div>

            {error && <p className="predict-error" style={{ marginTop: "1rem" }}>{error}</p>}

            <div className="wizard-nav" style={{ marginTop: "1.5rem" }}>
              <button type="button" className="gla-predict-cancel" onClick={() => setStep(3)}>← Back</button>
              <button
                type="button"
                className="gla-predict-submit"
                disabled={loading || racesLoading || !name.trim() || !effectiveRaceId}
                onClick={handleSubmit}
              >
                {loading ? "Creating..." : "Create League →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
