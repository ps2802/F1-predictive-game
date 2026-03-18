"use client";

import { useEffect, useState } from "react";
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

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
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
        <p className="gla-page-sub">Enter race results and trigger scoring</p>

        {/* Race selector */}
        <div style={{ margin: "2rem 0 1.5rem" }}>
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
      </div>
    </div>
  );
}
