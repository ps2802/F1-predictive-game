"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { track } from "@/lib/analytics";
import { useRaceCatalog } from "@/lib/raceCatalog";

type CreateLeaguePageClientProps = {
  initialRaceId: string | null;
};

export default function CreateLeaguePageClient({
  initialRaceId,
}: CreateLeaguePageClientProps): React.ReactElement {
  const router = useRouter();
  const { races, loading: racesLoading } = useRaceCatalog();
  const [step, setStep] = useState(1);
  const [raceId, setRaceId] = useState(initialRaceId ?? "");
  const [scopeToRace, setScopeToRace] = useState(Boolean(initialRaceId));
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"public" | "private">("private");
  const [maxUsers, setMaxUsers] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectableRaces = races.filter((race) => race.status === "upcoming");
  const effectiveRaceId = scopeToRace
    ? raceId || selectableRaces[0]?.id || races[0]?.id || ""
    : "";

  useEffect(() => {
    track("league_create_started", { initial_race_id: initialRaceId ?? undefined });
  }, [initialRaceId]);

  async function handleSubmit(): Promise<void> {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          type,
          race_id: scopeToRace ? effectiveRaceId : null,
          max_users: parseInt(maxUsers, 10) || 1000,
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
        { league_id: data.league?.id, race_id: effectiveRaceId || undefined },
        { send_to_posthog: false, send_to_clarity: true }
      );

      router.push(`/leagues/${data.league.id}`);
    } catch {
      setError("Failed to create league. Please try again.");
      setLoading(false);
    }
  }

  const canProceedStep1 = name.trim().length > 0;
  const canProceedStep2 =
    !scopeToRace || (!racesLoading && races.length > 0 && Boolean(effectiveRaceId));

  const selectedRaceName =
    selectableRaces.find((r) => r.id === effectiveRaceId)?.name ??
    races.find((r) => r.id === effectiveRaceId)?.name ??
    "All season";

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />

      <div className="gla-content" style={{ maxWidth: "540px" }}>
        <Link href="/leagues" className="predict-back" style={{ display: "block", marginBottom: "1.5rem" }}>
          ← Leagues
        </Link>

        <p className="gla-page-title">Create League</p>
        <p className="gla-page-sub">Set up a podium league and bring in your friends</p>

        {/* Wizard progress */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '2rem' }}>
          {[1, 2, 3].map((n) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.9rem',
                background: step >= n ? '#E10600' : 'rgba(255,255,255,0.1)',
                color: '#fff',
                border: step === n ? '2px solid rgba(255,255,255,0.3)' : 'none',
                transition: 'all 0.2s',
                position: 'relative' as const,
                zIndex: 1,
              }}>
                {step > n ? '✓' : n}
              </div>
              {n < 3 && (
                <div style={{
                  width: '48px',
                  height: '2px',
                  background: step > n ? '#E10600' : 'rgba(255,255,255,0.1)',
                  transition: 'background 0.2s',
                }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: '1.5rem' }}>
          {(['Setup', 'Scope', 'Review'] as const).map((label, i) => (
            <div key={label} style={{
              width: '36px',
              textAlign: 'center',
              fontSize: '0.6rem',
              color: step === i + 1 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
              marginRight: i < 2 ? '48px' : '0',
              fontWeight: step === i + 1 ? 700 : 400,
            }}>
              {label}
            </div>
          ))}
        </div>

        {/* Step 1: Name + Description + Type */}
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
                  data-testid="league-create-name-input"
                />
              </label>

              <label className="auth-label" style={{ marginTop: "1rem" }}>
                Description <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>(optional)</span>
                <input
                  className="auth-input"
                  placeholder="e.g. Bragging rights only. No mercy."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={140}
                  data-testid="league-create-description-input"
                />
              </label>

              <div className="auth-label" style={{ marginBottom: "0.5rem", marginTop: "1.5rem" }}>League Type</div>
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
                  data-testid="league-create-type-private"
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

        {/* Step 2: Scope (race + size) */}
        {step === 2 && (
          <div className="wizard-panel">
            <div className="auth-form">
              <div className="auth-label" style={{ marginBottom: "0.5rem" }}>League Scope</div>
              <div className="league-type-cards">
                <button
                  type="button"
                  className={`league-type-card${!scopeToRace ? " is-selected" : ""}`}
                  onClick={() => setScopeToRace(false)}
                >
                  <span className="league-type-card-icon">🏁</span>
                  <strong className="league-type-card-title">Full Season</strong>
                  <span className="league-type-card-desc">Standings carry across every round of the season</span>
                </button>
                <button
                  type="button"
                  className={`league-type-card${scopeToRace ? " is-selected" : ""}`}
                  onClick={() => setScopeToRace(true)}
                >
                  <span className="league-type-card-icon">📍</span>
                  <strong className="league-type-card-title">Single Race</strong>
                  <span className="league-type-card-desc">One race, one shot — settle it on a single podium</span>
                </button>
              </div>

              {scopeToRace && !racesLoading && selectableRaces.length > 0 && (
                <label className="auth-label" style={{ marginTop: "1.5rem" }}>
                  Race
                  <select
                    className="auth-input"
                    value={effectiveRaceId}
                    onChange={(e) => setRaceId(e.target.value)}
                    style={{ width: "100%" }}
                    data-testid="league-create-race-select"
                  >
                    {selectableRaces.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} · Round {r.round}</option>
                    ))}
                  </select>
                </label>
              )}

              {scopeToRace && !racesLoading && selectableRaces.length === 0 && (
                <p className="predict-error" style={{ marginTop: "1rem" }}>
                  No upcoming races to scope to right now.
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
                  data-testid="league-create-max-users-input"
                />
              </label>

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

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="wizard-panel">
            <div className="wizard-review-card">
              <h3 className="wizard-review-name">{name}</h3>
              <span className={`league-card-type ${type}`}>{type}</span>

              <div className="wizard-review-grid">
                {description.trim() && (
                  <div className="wizard-review-row">
                    <span className="wizard-review-label">Description</span>
                    <span className="wizard-review-val">{description.trim()}</span>
                  </div>
                )}
                <div className="wizard-review-row">
                  <span className="wizard-review-label">Scope</span>
                  <span className="wizard-review-val">{scopeToRace ? "Single Race" : "Full Season"}</span>
                </div>
                <div className="wizard-review-row">
                  <span className="wizard-review-label">Race</span>
                  <span className="wizard-review-val">{selectedRaceName}</span>
                </div>
                <div className="wizard-review-row">
                  <span className="wizard-review-label">Max Members</span>
                  <span className="wizard-review-val">{maxUsers}</span>
                </div>
              </div>
            </div>

            {error && <p className="predict-error" style={{ marginTop: "1rem" }}>{error}</p>}

            <div className="wizard-nav" style={{ marginTop: "1.5rem" }}>
              <button type="button" className="gla-predict-cancel" onClick={() => setStep(2)}>← Back</button>
              <button
                type="button"
                className="gla-predict-submit"
                disabled={loading || !name.trim() || (scopeToRace && !effectiveRaceId)}
                onClick={handleSubmit}
                data-testid="league-create-submit-button"
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
