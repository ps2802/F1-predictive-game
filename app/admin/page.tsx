"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";

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

type Section = "races" | "results";

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

  // ── Results / Scoring state ───────────────────────────
  const [selectedRace, setSelectedRace] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [results, setResults] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [settling, setSettling] = useState(false);
  const [message, setMessage] = useState("");
  const [questionsLoading, setQuestionsLoading] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();
      if (!profile?.is_admin) { router.push("/dashboard"); return; }
      setIsAdmin(true);
      setLoading(false);
    });
  }, [router]);

  // ── Race Management functions ─────────────────────────

  const loadDbRaces = useCallback(async () => {
    setRacesLoading(true);
    const res = await fetch("/api/admin/races");
    const data = await res.json();
    if (res.ok) setDbRaces(data.races ?? []);
    setRacesLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadDbRaces();
  }, [isAdmin, loadDbRaces]);

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
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const { data } = await supabase
      .from("prediction_questions")
      .select("*, options:prediction_options(*)")
      .eq("race_id", raceId)
      .order("display_order");

    setQuestions(
      (data ?? []).map((q) => ({
        ...q,
        options: q.options ?? [],
      }))
    );
    setQuestionsLoading(false);
  }

  function handleRaceChange(raceId: string) {
    setSelectedRace(raceId);
    setMessage("");
    if (raceId) loadQuestions(raceId);
  }

  function handleOptionSelect(questionId: string, optionId: string, pickOrder: number, multiSelect: number) {
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
    setMessage(res.ok ? "✓ Results saved." : `Error: ${data.error}`);
    setSubmitting(false);
  }

  async function handleSettle() {
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

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <nav className="gla-nav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gridlock logo - transparent.png" alt="Gridlock" className="gla-nav-logo" draggable={false} />
        <div className="gla-nav-right">
          <Link className="gla-nav-link" href="/dashboard">Dashboard</Link>
          <span className="gla-nav-link" style={{ color: "var(--gl-red)" }}>Admin</span>
          <button className="gla-nav-link" onClick={async () => {
            const supabase = createSupabaseBrowserClient();
            if (supabase) await supabase.auth.signOut();
            router.push("/login");
          }}>Sign out</button>
        </div>
      </nav>

      <div className="gla-content">
        <p className="gla-page-title">Admin Panel</p>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: "0.5rem", margin: "1.5rem 0 2rem" }}>
          {(["races", "results"] as Section[]).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
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
              {s === "races" ? "Race Management" : "Results & Scoring"}
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
                  {races.map((r) => (
                    <option key={r.id} value={r.id}>
                      R{r.round} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {questionsLoading && <div className="gl-spinner" />}

            {questions.length > 0 && (
              <>
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
                    disabled={submitting}
                  >
                    {submitting ? "Saving..." : "Save Results"}
                  </button>
                  <button
                    className="gla-race-btn"
                    style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.2)" }}
                    onClick={handleSettle}
                    disabled={settling}
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
