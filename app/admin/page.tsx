"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/admin";
import { PLATFORM_FEE_WALLET_ADDRESS } from "@/lib/gameRules";

type Question = {
  id: string;
  category: string;
  label: string;
  question_type: string;
  multi_select: number;
  options: { id: string; option_value: string }[];
};

type ResultEntry = {
  question_id: string;
  correct_option_id: string;
  pick_order: number;
};

type DbRace = {
  id: string;
  season: number;
  round: number;
  grand_prix_name: string;
  circuit: string | null;
  race_starts_at: string | null;
  qualifying_starts_at: string | null;
  race_locked: boolean;
  is_locked: boolean;
  question_count: number;
};

type Section = "races" | "results" | "revenue" | "wallets";

type FeeData = {
  breakdown: { leagueRake: number; editFees: number; total: number };
  recentFees: Array<{ id: string; amount: number; description: string | null; created_at: string }>;
};

type WalletEntry = {
  userId: string;
  username: string;
  address: string;
  watched: boolean;
};

const emptyForm = {
  id: "",
  round: "",
  grand_prix_name: "",
  circuit: "",
  race_starts_at: "",
  qualifying_starts_at: "",
};

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("races");

  // ── Race Management state ─────────────────────────────
  const [dbRaces, setDbRaces] = useState<DbRace[]>([]);
  const [racesLoading, setRacesLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [seedingRace, setSeedingRace] = useState<string | null>(null);
  const [lockingRace, setLockingRace] = useState<string | null>(null);
  const [raceActionMsg, setRaceActionMsg] = useState("");

  // ── Platform Revenue state ────────────────────────────
  const [feeData, setFeeData] = useState<FeeData | null>(null);

  // ── Wallets state ────────────────────────────────────
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [enrollingAll, setEnrollingAll] = useState(false);
  const [walletMsg, setWalletMsg] = useState("");

  // ── Results / Scoring state ───────────────────────────
  const [selectedRace, setSelectedRace] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [message, setMessage] = useState("");
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [resultsDirty, setResultsDirty] = useState(false);
  const [hasSavedResults, setHasSavedResults] = useState(false);

  // ── Race Management functions ─────────────────────────

  const loadDbRaces = useCallback(async () => {
    setRacesLoading(true);
    const res = await fetch("/api/admin/races");
    const data = await res.json();
    if (res.ok) setDbRaces(data.races ?? []);
    setRacesLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/"); return; }
      if (!isAdminEmail(user.email)) { router.push("/dashboard"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      if (!profile?.is_admin) { router.push("/dashboard"); return; }
      setIsAdmin(true);
      await loadDbRaces();
      fetch("/api/admin/fees")
        .then((r) => r.json())
        .then((d) => setFeeData(d))
        .catch(() => null);
      setLoading(false);
    });
  }, [loadDbRaces, router]);

  async function loadWallets() {
    setWalletsLoading(true);
    const res = await fetch("/api/admin/wallets");
    const data = await res.json();
    if (res.ok) setWallets(data.wallets ?? []);
    setWalletsLoading(false);
  }

  async function handleEnrollAll() {
    setEnrollingAll(true);
    setWalletMsg("");
    const res = await fetch("/api/admin/wallets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await res.json();
    if (res.ok) {
      setWalletMsg(`✓ Enrolled ${data.enrolled} address${data.enrolled !== 1 ? "es" : ""} with Helius.`);
      await loadWallets();
    } else {
      setWalletMsg(`Error: ${data.error}`);
    }
    setEnrollingAll(false);
  }

  async function handleEnrollOne(address: string) {
    setWalletMsg("");
    const res = await fetch("/api/admin/wallets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
    const data = await res.json();
    if (res.ok) {
      setWalletMsg(`✓ Enrolled ${address.slice(0, 8)}…`);
      await loadWallets();
    } else {
      setWalletMsg(`Error: ${data.error}`);
    }
  }

  function handleFormChange(field: keyof typeof emptyForm, value: string) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreateRace(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMsg("");

    const payload = {
      id: createForm.id.trim(),
      round: parseInt(createForm.round, 10),
      grand_prix_name: createForm.grand_prix_name.trim(),
      circuit: createForm.circuit.trim() || undefined,
      // datetime-local gives "2026-03-29T15:00" (no TZ) — append :00Z for valid ISO-8601
      race_starts_at: createForm.race_starts_at ? createForm.race_starts_at + ":00Z" : undefined,
      qualifying_starts_at: createForm.qualifying_starts_at ? createForm.qualifying_starts_at + ":00Z" : undefined,
    };

    const res = await fetch("/api/admin/races", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok) {
      setCreateMsg(`✓ Race "${payload.id}" created.`);
      setCreateForm(emptyForm);
      setShowCreateForm(false);
      await loadDbRaces();
    } else {
      setCreateMsg(`Error: ${data.error}`);
    }
    setCreating(false);
  }

  async function handleSeed(raceId: string) {
    setSeedingRace(raceId);
    setRaceActionMsg("");
    const res = await fetch("/api/admin/races/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId }),
    });
    const data = await res.json();
    if (res.ok) {
      setRaceActionMsg(`✓ Seeded ${data.questions_created} questions for ${raceId}.`);
      await loadDbRaces();
    } else {
      setRaceActionMsg(`Error: ${data.error}`);
    }
    setSeedingRace(null);
  }

  async function handleToggleLock(raceId: string, currentlyLocked: boolean) {
    setLockingRace(raceId);
    setRaceActionMsg("");
    const res = await fetch("/api/admin/races/lock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId, locked: !currentlyLocked }),
    });
    const data = await res.json();
    if (res.ok) {
      setRaceActionMsg(`✓ ${raceId} is now ${!currentlyLocked ? "locked" : "unlocked"}.`);
      await loadDbRaces();
    } else {
      setRaceActionMsg(`Error: ${data.error}`);
    }
    setLockingRace(null);
  }

  // ── Results / Scoring functions ───────────────────────

  async function loadQuestions(raceId: string) {
    setQuestionsLoading(true);
    setResults({});
    setResultsDirty(false);
    setHasSavedResults(false);
    setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const [{ data: questionData }, { data: existingResults }] = await Promise.all([
      supabase
        .from("prediction_questions")
        .select("*, options:prediction_options(*)")
        .eq("race_id", raceId)
        .order("display_order"),
      supabase
        .from("race_results")
        .select("question_id, correct_option_id, pick_order")
        .eq("race_id", raceId),
    ]);

    setQuestions(
      (questionData ?? []).map((q) => ({
        ...q,
        options: q.options ?? [],
      }))
    );

    if (existingResults && existingResults.length > 0) {
      const loaded: Record<string, string[]> = {};
      for (const result of existingResults) {
        if (!loaded[result.question_id]) loaded[result.question_id] = [];
        loaded[result.question_id][result.pick_order - 1] = result.correct_option_id;
      }
      setResults(loaded);
      setHasSavedResults(true);
    }
    setQuestionsLoading(false);
  }

  function handleRaceChange(raceId: string) {
    setSelectedRace(raceId);
    setMessage("");
    if (raceId) loadQuestions(raceId);
  }

  function handleOptionSelect(questionId: string, optionId: string, pickOrder: number, multiSelect: number) {
    setResultsDirty(true);
    setMessage("");
    setResults((prev) => {
      const current = [...(prev[questionId] ?? [])];
      if (multiSelect === 1) return { ...prev, [questionId]: [optionId] };
      const existing = current[pickOrder - 1];
      if (existing === optionId) {
        current[pickOrder - 1] = "";
      } else {
        current[pickOrder - 1] = optionId;
      }
      return { ...prev, [questionId]: current };
    });
  }

  async function handleSubmitResults() {
    if (!resultsComplete) {
      setMessage("Error: complete every result before saving.");
      return;
    }

    if (!window.confirm(`Save results for ${selectedRace}? This will overwrite the currently stored answer set for this race.`)) {
      return;
    }

    setSubmitting(true);
    setMessage("");

    const resultRows: ResultEntry[] = [];
    for (const [questionId, optionIds] of Object.entries(results)) {
      for (let i = 0; i < optionIds.length; i++) {
        if (optionIds[i]) {
          resultRows.push({ question_id: questionId, correct_option_id: optionIds[i], pick_order: i + 1 });
        }
      }
    }

    const res = await fetch("/api/admin/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId: selectedRace, results: resultRows }),
    });
    const data = await res.json();
    if (res.ok) {
      setHasSavedResults(true);
      setResultsDirty(false);
      setMessage("✓ Results saved.");
    } else {
      setMessage(`Error: ${data.error}`);
    }
    setSubmitting(false);
  }

  async function handleSettle() {
    if (!hasSavedResults) {
      setMessage("Error: save results before running settlement.");
      return;
    }

    if (resultsDirty) {
      setMessage("Error: you have unsaved result changes. Save results before settling.");
      return;
    }

    if (!window.confirm(`Run settlement and scoring for ${selectedRace}? Use this only after reviewing the saved results.`)) {
      return;
    }

    setSettling(true);
    setMessage("");
    const res = await fetch("/api/admin/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId: selectedRace }),
    });
    const data = await res.json();
    setMessage(res.ok ? `✓ Settled: ${data.scores_computed} scores computed.` : `Error: ${data.error}`);
    setSettling(false);
  }

  // ── Render ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const incompleteQuestions = questions.filter((q) => {
    const picks = (results[q.id] ?? []).filter(Boolean);
    return picks.length < q.multi_select;
  });
  const resultsComplete = questions.length > 0 && incompleteQuestions.length === 0;

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={{ is_admin: true }} />

      <div className="gla-content">
        <p className="gla-page-title">Admin Panel</p>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: "0.5rem", margin: "1.5rem 0 2rem", flexWrap: "wrap" }}>
          {(["races", "results", "revenue", "wallets"] as Section[]).map((s) => (
            <button
              key={s}
              onClick={() => { setSection(s); if (s === "wallets") loadWallets(); }}
              style={{
                padding: "0.4rem 1rem",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: section === s ? "var(--gl-red)" : "transparent",
                color: "#fff",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: section === s ? 700 : 400,
              }}
            >
              {s === "races" ? "Race Management" : s === "results" ? "Results & Scoring" : s === "revenue" ? "Platform Revenue" : "Wallets"}
            </button>
          ))}
        </div>

        {/* ── RACE MANAGEMENT ── */}
        {section === "races" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

            {/* Action message */}
            {(raceActionMsg || createMsg) && (
              <p style={{
                color: (raceActionMsg || createMsg).startsWith("✓") ? "#4caf50" : "var(--gl-red)",
                fontSize: "0.9rem",
              }}>
                {raceActionMsg || createMsg}
              </p>
            )}

            {/* Create race */}
            <div>
              <button
                className="gla-race-btn"
                onClick={() => { setShowCreateForm((v) => !v); setCreateMsg(""); }}
                style={{ fontSize: "0.85rem" }}
              >
                {showCreateForm ? "Cancel" : "+ Create Race"}
              </button>

              {showCreateForm && (
                <form
                  onSubmit={handleCreateRace}
                  style={{
                    marginTop: "1rem",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                    padding: "1.25rem",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <label className="auth-label" style={{ gridColumn: "1 / -1" }}>
                    Race ID / Slug <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>(e.g. japan-2026)</span>
                    <input
                      className="auth-input"
                      value={createForm.id}
                      onChange={(e) => handleFormChange("id", e.target.value.toLowerCase())}
                      placeholder="japan-2026"
                      required
                    />
                  </label>

                  <label className="auth-label">
                    Round
                    <input
                      className="auth-input"
                      type="number"
                      min={1}
                      max={30}
                      value={createForm.round}
                      onChange={(e) => handleFormChange("round", e.target.value)}
                      placeholder="3"
                      required
                    />
                  </label>

                  <label className="auth-label">
                    Grand Prix Name
                    <input
                      className="auth-input"
                      value={createForm.grand_prix_name}
                      onChange={(e) => handleFormChange("grand_prix_name", e.target.value)}
                      placeholder="Japanese Grand Prix"
                      required
                    />
                  </label>

                  <label className="auth-label">
                    Circuit <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>(optional)</span>
                    <input
                      className="auth-input"
                      value={createForm.circuit}
                      onChange={(e) => handleFormChange("circuit", e.target.value)}
                      placeholder="Suzuka International Racing Course"
                    />
                  </label>

                  <label className="auth-label">
                    Race Start <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>(optional)</span>
                    <input
                      className="auth-input"
                      type="datetime-local"
                      value={createForm.race_starts_at}
                      onChange={(e) => handleFormChange("race_starts_at", e.target.value)}
                    />
                  </label>

                  <label className="auth-label">
                    Qualifying Start <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}>(optional)</span>
                    <input
                      className="auth-input"
                      type="datetime-local"
                      value={createForm.qualifying_starts_at}
                      onChange={(e) => handleFormChange("qualifying_starts_at", e.target.value)}
                    />
                  </label>

                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <button className="gla-race-btn" type="submit" disabled={creating}>
                      {creating ? "Creating..." : "Create Race"}
                    </button>
                    {createMsg && (
                      <span style={{ fontSize: "0.85rem", color: createMsg.startsWith("✓") ? "#4caf50" : "var(--gl-red)" }}>
                        {createMsg}
                      </span>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* Race list */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", margin: 0 }}>
                  {dbRaces.length} race{dbRaces.length !== 1 ? "s" : ""} in database
                </p>
                <button
                  onClick={loadDbRaces}
                  style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  ↺ Refresh
                </button>
              </div>

              {racesLoading ? (
                <div className="gl-spinner" />
              ) : dbRaces.length === 0 ? (
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.85rem" }}>No races found.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {dbRaces.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2.5rem 1fr auto auto auto",
                        gap: "0.75rem",
                        alignItems: "center",
                        padding: "0.65rem 1rem",
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "6px",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      {/* Round */}
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem" }}>
                        R{r.round}
                      </span>

                      {/* Name + id */}
                      <div>
                        <span style={{ fontSize: "0.9rem", color: "#fff" }}>{r.grand_prix_name}</span>
                        <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.3)" }}>
                          {r.id}
                        </span>
                      </div>

                      {/* Questions badge */}
                      <span style={{
                        fontSize: "0.75rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        background: r.question_count > 0 ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.07)",
                        color: r.question_count > 0 ? "#4caf50" : "rgba(255,255,255,0.35)",
                        whiteSpace: "nowrap",
                      }}>
                        {r.question_count > 0 ? `${r.question_count} questions` : "not seeded"}
                      </span>

                      {/* Seed button */}
                      <button
                        onClick={() => handleSeed(r.id)}
                        disabled={seedingRace === r.id || r.question_count > 0}
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.6rem",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,255,255,0.15)",
                          background: "transparent",
                          color: r.question_count > 0 ? "rgba(255,255,255,0.2)" : "#fff",
                          cursor: r.question_count > 0 ? "default" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                        title={r.question_count > 0 ? "Already seeded" : "Seed standard questions"}
                      >
                        {seedingRace === r.id ? "Seeding…" : r.question_count > 0 ? "Seeded" : "Seed"}
                      </button>

                      {/* Lock / Unlock */}
                      <button
                        onClick={() => handleToggleLock(r.id, r.race_locked)}
                        disabled={lockingRace === r.id}
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.6rem",
                          borderRadius: "4px",
                          border: `1px solid ${r.race_locked ? "rgba(225,6,0,0.4)" : "rgba(255,255,255,0.15)"}`,
                          background: r.race_locked ? "rgba(225,6,0,0.12)" : "transparent",
                          color: r.race_locked ? "#ff6b6b" : "#fff",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {lockingRace === r.id ? "…" : r.race_locked ? "🔒 Locked" : "Unlocked"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PLATFORM REVENUE ── */}
        {section === "revenue" && (
          <section className="admin-section">
            <h2 className="admin-section-title">Platform Revenue</h2>
            {feeData ? (
              <>
                <div className="admin-stats-row">
                  <div className="admin-stat-card">
                    <span className="admin-stat-value">${feeData.breakdown.total.toFixed(2)}</span>
                    <span className="admin-stat-label">Total Collected</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="admin-stat-value">${feeData.breakdown.leagueRake.toFixed(2)}</span>
                    <span className="admin-stat-label">League Rake (10%)</span>
                  </div>
                  <div className="admin-stat-card">
                    <span className="admin-stat-value">${feeData.breakdown.editFees.toFixed(2)}</span>
                    <span className="admin-stat-label">Edit Fees</span>
                  </div>
                </div>

                {feeData.recentFees.length > 0 && (
                  <div className="admin-fee-list">
                    <h3 className="admin-subsection-title">Recent Events</h3>
                    {feeData.recentFees.slice(0, 10).map((fee) => (
                      <div key={fee.id} className="admin-fee-row">
                        <span className="admin-fee-desc">{fee.description ?? "Fee"}</span>
                        <span className="admin-fee-amount">+${Number(fee.amount).toFixed(2)}</span>
                        <span className="admin-fee-date">
                          {new Date(fee.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="admin-fee-note" style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                  <span style={{ opacity: 0.6, fontSize: "0.75rem", display: "block", marginBottom: "0.25rem" }}>Fee collection wallet</span>
                  {PLATFORM_FEE_WALLET_ADDRESS}
                </div>
              </>
            ) : (
              <p className="admin-loading">Loading revenue data...</p>
            )}
          </section>
        )}

        {/* ── WALLETS ── */}
        {section === "wallets" && (
          <section className="admin-section">
            <h2 className="admin-section-title">User Wallets</h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              Wallets automatically enroll when users log in via Privy. Use &quot;Enroll All&quot; to backfill existing accounts.
            </p>

            {walletMsg && (
              <p style={{ fontSize: "0.9rem", color: walletMsg.startsWith("✓") ? "#4caf50" : "var(--gl-red)", marginBottom: "1rem" }}>
                {walletMsg}
              </p>
            )}

            <button
              className="gla-race-btn"
              onClick={handleEnrollAll}
              disabled={enrollingAll}
              style={{ marginBottom: "1.5rem" }}
            >
              {enrollingAll ? "Enrolling…" : "Enroll All with Helius"}
            </button>

            {walletsLoading ? (
              <div className="gl-spinner" />
            ) : wallets.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.85rem" }}>No user wallets found.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {wallets.map((w) => (
                  <div
                    key={w.userId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: "1rem",
                      alignItems: "center",
                      padding: "0.6rem 1rem",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: "6px",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "0.9rem", color: "#fff" }}>{w.username}</span>
                      <span style={{ marginLeft: "0.75rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
                        {w.address.slice(0, 8)}…{w.address.slice(-6)}
                      </span>
                    </div>
                    <span style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      background: w.watched ? "rgba(76,175,80,0.15)" : "rgba(255,165,0,0.12)",
                      color: w.watched ? "#4caf50" : "#ffa500",
                    }}>
                      {w.watched ? "Watching" : "Not enrolled"}
                    </span>
                    {!w.watched && (
                      <button
                        onClick={() => handleEnrollOne(w.address)}
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.6rem",
                          borderRadius: "4px",
                          border: "1px solid rgba(255,255,255,0.15)",
                          background: "transparent",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Enroll
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── RESULTS & SCORING ── */}
        {section === "results" && (
          <>
            <p className="gla-page-sub" style={{ marginBottom: "1.5rem" }}>Enter race results and trigger scoring</p>

            {/* Race selector */}
            <div style={{ margin: "0 0 1.5rem" }}>
              <label className="auth-label">
                Select Race
                <select
                  className="gla-predict-select"
                  value={selectedRace}
                  onChange={(e) => handleRaceChange(e.target.value)}
                >
                  <option value="">— choose race —</option>
                  {dbRaces.map((r) => (
                    <option key={r.id} value={r.id}>
                      R{r.round} · {r.grand_prix_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {questionsLoading && <div className="gl-spinner" />}

            {questions.length > 0 && (
              <>
                <div className="admin-results-status">
                  <span>
                    {resultsComplete
                      ? "All required results entered."
                      : `${incompleteQuestions.length} question${incompleteQuestions.length === 1 ? "" : "s"} still need results.`}
                  </span>
                  {hasSavedResults && !resultsDirty && (
                    <span>Saved results loaded.</span>
                  )}
                  {resultsDirty && (
                    <span>Unsaved changes.</span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "2rem" }}>
                  {questions.map((q) => {
                    const currentPicks = results[q.id] ?? [];
                    return (
                      <div key={q.id} className="predict-question">
                        <div className="predict-q-header">
                          <h3 className="predict-q-label">{q.label}</h3>
                          <span className="predict-q-meta">
                            {q.category} {q.multi_select > 1 && `· pick ${q.multi_select}`}
                          </span>
                        </div>
                        <div className="predict-options">
                          {q.options.map((opt) => {
                            const pickIdx = currentPicks.indexOf(opt.id);
                            const selected = pickIdx !== -1;
                            return (
                              <button
                                key={opt.id}
                                className={`predict-option${selected ? " is-selected" : ""}`}
                                onClick={() =>
                                  handleOptionSelect(q.id, opt.id, selected ? pickIdx + 1 : currentPicks.filter(Boolean).length + 1, q.multi_select)
                                }
                              >
                                {q.multi_select > 1 && selected && (
                                  <span className="predict-pick-badge">{pickIdx + 1}</span>
                                )}
                                {opt.option_value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {message && (
                  <p style={{ marginBottom: "1rem", color: message.startsWith("✓") ? "#4caf50" : "var(--gl-red)" }}>
                    {message}
                  </p>
                )}

                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <button
                    className="gla-race-btn"
                    onClick={handleSubmitResults}
                    disabled={submitting || !resultsComplete}
                  >
                    {submitting ? "Saving..." : hasSavedResults ? "Update Results" : "Save Results"}
                  </button>
                  <button
                    className="gla-race-btn"
                    style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.2)" }}
                    onClick={handleSettle}
                    disabled={settling || !hasSavedResults || resultsDirty}
                  >
                    {settling ? "Settling..." : "Trigger Settlement & Scoring"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
