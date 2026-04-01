"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { PREDICTION_EDIT_FEE_USDC } from "@/lib/gameRules";
import { formatCountdown, resolvePredictionWindow } from "@/lib/predictionWindows";
import { findRaceById, useRaceCatalog } from "@/lib/raceCatalog";

type Option = {
  id: string;
  option_type: string;
  option_value: string;
  display_order: number;
};

type Question = {
  id: string;
  category: "qualifying" | "race" | "chaos";
  question_type: string;
  label: string;
  base_points: number;
  confidence_tier: string;
  multi_select: number;
  display_order: number;
  options: Option[];
};

// question_id → option_id[]
type Answers = Record<string, string[]>;
type RaceTiming = {
  qualifying_starts_at: string | null;
  race_starts_at: string | null;
  quali_locked: boolean;
  race_locked: boolean;
};

const STEPS = ["qualifying", "race", "chaos", "review"] as const;
const STEP_LABELS: Record<string, string> = {
  qualifying: "Qualifying",
  race: "Race",
  chaos: "Chaos",
  review: "Review",
};
const STEP_ICONS: Record<string, string> = {
  qualifying: "Q",
  race: "R",
  chaos: "⚡",
  review: "✎",
};

export default function PredictPage() {
  const params = useParams();
  const router = useRouter();
  const raceId = params?.raceId as string;
  const { races, loading: racesLoading } = useRaceCatalog();
  const race = findRaceById(races, raceId);

  const [step, setStep] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [sectionIncomplete, setSectionIncomplete] = useState(false);
  const [raceTiming, setRaceTiming] = useState<RaceTiming | null>(null);
  const [chargedEditFee, setChargedEditFee] = useState(false);
  const [copyingExpert, setCopyingExpert] = useState(false);
  const [expertCopied, setExpertCopied] = useState(false);

  const currentCategory = STEPS[step];
  const currentQuestions = questions.filter(
    (q) => q.category === currentCategory
  );
  const qualifyingWindow = resolvePredictionWindow(
    raceTiming ?? {},
    "qualifying"
  );
  const raceWindow = resolvePredictionWindow(raceTiming ?? {}, "race");
  const currentWindow =
    currentCategory === "qualifying" ? qualifyingWindow : currentCategory === "review" ? null : raceWindow;
  const allQuestionsComplete = questions.every((q) => {
    const picks = (answers[q.id] ?? []).filter(Boolean);
    return picks.length >= q.multi_select;
  });
  const anyLiveEditWindow = qualifyingWindow.paidEdit || raceWindow.paidEdit;

  const loadData = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setIsAuthenticated(!!user);

    const { data: qData } = await supabase
      .from("prediction_questions")
      .select("*, options:prediction_options(*)")
      .eq("race_id", raceId)
      .order("display_order");

    if (qData) {
      setQuestions(
        qData.map((q) => ({
          ...q,
          options: (q.options ?? []).sort(
            (a: Option, b: Option) => a.display_order - b.display_order
          ),
        }))
      );
    }

    const { data: raceRow } = await supabase
      .from("races")
      .select("qualifying_starts_at, race_starts_at, quali_locked, race_locked")
      .eq("id", raceId)
      .single();

    if (raceRow) {
      setRaceTiming({
        qualifying_starts_at: raceRow.qualifying_starts_at,
        race_starts_at: raceRow.race_starts_at,
        quali_locked: raceRow.quali_locked === true,
        race_locked: raceRow.race_locked === true,
      });
    }

    // Load saved answers from localStorage (for anon flow)
    const stored = localStorage.getItem(`picks_${raceId}`);
    if (stored) {
      try { setAnswers(JSON.parse(stored)); } catch { /* ignore */ }
    }

    // Load server-side answers if authenticated
    if (user) {
      const { data: pred } = await supabase
        .from("predictions")
        .select("id")
        .eq("race_id", raceId)
        .eq("user_id", user.id)
        .single();

      if (pred) {
        const { data: ansData } = await supabase
          .from("prediction_answers")
          .select("question_id, option_id, pick_order")
          .eq("prediction_id", pred.id);

        if (ansData && ansData.length > 0) {
          const loaded: Answers = {};
          for (const ans of ansData) {
            if (!loaded[ans.question_id]) loaded[ans.question_id] = [];
            loaded[ans.question_id][ans.pick_order - 1] = ans.option_id;
          }
          setAnswers(loaded);
          setIsEditing(true); // user already predicted — show edit mode
        }
      }
    }

    setLoading(false);
  }, [raceId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Persist answers to localStorage as user picks
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      localStorage.setItem(`picks_${raceId}`, JSON.stringify(answers));
    }
  }, [answers, raceId]);

  function handleSelect(
    questionId: string,
    optionId: string,
    multiSelect: number,
    currentPicks: string[]
  ) {
    setAnswers((prev) => {
      const picks = [...(prev[questionId] ?? [])];

      // Deselection check runs first for ALL question types, including single-select.
      // This allows users to change their mind before submitting.
      const existing = picks.indexOf(optionId);
      if (existing !== -1) {
        picks.splice(existing, 1);
        return { ...prev, [questionId]: picks.filter(Boolean) };
      }

      // Single-select: replace any existing pick with this one
      if (multiSelect === 1) {
        return { ...prev, [questionId]: [optionId] };
      }

      // Multi-select: add if slots remain
      if (picks.filter(Boolean).length < multiSelect) {
        picks.push(optionId);
      }
      return { ...prev, [questionId]: picks.filter(Boolean) };
    });
    void currentPicks; // suppress lint
    setSectionIncomplete(false); // clear warning on any selection
  }

  function isOptionSelected(questionId: string, optionId: string) {
    return (answers[questionId] ?? []).includes(optionId);
  }

  function getPickIndex(questionId: string, optionId: string) {
    return (answers[questionId] ?? []).indexOf(optionId);
  }

  function stepComplete(category: string) {
    if (category === "review") return false;
    const qs = questions.filter((q) => q.category === category);
    if (qs.length === 0) return true;
    return qs.every((q) => {
      const picks = (answers[q.id] ?? []).filter(Boolean);
      return picks.length >= q.multi_select;
    });
  }

  function getOptionLabel(optionId: string): string {
    for (const q of questions) {
      for (const opt of q.options) {
        if (opt.id === optionId) return opt.option_value;
      }
    }
    return "—";
  }

  function renderReview() {
    const categories = ["qualifying", "race", "chaos"] as const;
    return (
      <div className="predict-review">
        {categories.map((cat) => {
          const catQuestions = questions.filter((q) => q.category === cat);
          if (catQuestions.length === 0) return null;
          return (
            <div key={cat} className="predict-review-category">
              <h3>{STEP_LABELS[cat]}</h3>
              {catQuestions.map((q) => {
                const picks = (answers[q.id] ?? []).filter(Boolean);
                return (
                  <div key={q.id} className="predict-review-row">
                    <span className="predict-review-label">{q.label}</span>
                    <div className="predict-review-picks">
                      {picks.length > 0 ? (
                        picks.map((optId, i) => (
                          <span key={i} className="predict-review-pick">
                            {getOptionLabel(optId)}
                          </span>
                        ))
                      ) : (
                        <span className="predict-review-missing">No pick</span>
                      )}
                    </div>
                    <button
                      className="predict-review-edit-btn"
                      onClick={() => setStep(categories.indexOf(cat))}
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  async function handleSubmit() {
    if (!isAuthenticated) {
      router.push(`/login?redirect=/predict/${raceId}`);
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/predictions/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      track("prediction_submitted", { race_id: raceId });
      localStorage.removeItem(`picks_${raceId}`);
      setChargedEditFee(Boolean(data.chargedEditFee));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyExpert() {
    setCopyingExpert(true);
    try {
      const res = await fetch(`/api/races/${raceId}/top-picks`);
      const data = await res.json();
      if (data.picks && Object.keys(data.picks).length > 0) {
        setAnswers((prev) => ({ ...prev, ...data.picks }));
        setExpertCopied(true);
        setTimeout(() => setExpertCopied(false), 3000);
      }
    } catch {
      // ignore — non-critical
    } finally {
      setCopyingExpert(false);
    }
  }

  if (loading || racesLoading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "4rem" }}>
          <p style={{ color: "var(--gl-red)" }}>Race not found.</p>
          <Link href="/dashboard" className="gla-race-btn" style={{ marginTop: "1rem", display: "inline-block" }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="predict-success-icon">✓</div>
          <h1 className="gla-page-title" style={{ marginTop: "1.5rem" }}>
            {allQuestionsComplete ? "Predictions Locked In" : "Progress Saved"}
          </h1>
          <p className="gla-page-sub">
            {race.name} · Round {race.round}
          </p>
          {!allQuestionsComplete && (
            <p style={{
              color: "rgba(0, 210, 170, 1)",
              fontSize: "0.9rem",
              marginTop: "1rem",
              maxWidth: "400px",
              marginInline: "auto",
              lineHeight: 1.5,
            }}>
              Come back before each lock window to finish the rest of your picks.
            </p>
          )}
          {chargedEditFee && (
            <p style={{ color: "rgba(255,255,255,0.72)", marginTop: "0.75rem" }}>
              A ${PREDICTION_EDIT_FEE_USDC} USDC edit fee was charged for this update.
            </p>
          )}

          {/* Primary CTA: league join */}
          {allQuestionsComplete && (
            <div style={{ marginTop: "2rem", padding: "1.25rem", background: "rgba(0,210,170,0.07)", border: "1px solid rgba(0,210,170,0.2)", borderRadius: "12px", maxWidth: "400px", marginInline: "auto" }}>
              <p style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(0,210,170,0.7)", marginBottom: "0.5rem" }}>
                Next Step
              </p>
              <p style={{ fontSize: "0.95rem", color: "#fff", marginBottom: "1rem" }}>
                Join a league to compete for the prize pool
              </p>
              <Link href={`/leagues?raceId=${raceId}`} className="gla-race-btn" style={{ display: "block", textAlign: "center" }}>
                Choose a League &rarr;
              </Link>
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem", flexWrap: "wrap" }}>
            <Link href="/leaderboard" className="gla-race-btn" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}>
              Global Leaderboard
            </Link>
            <Link href="/dashboard" className="gla-race-btn" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}>
              All Races
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />

      {/* Header */}
      <div className="predict-header">
        <Link href="/dashboard" className="predict-back">
          ← Dashboard
        </Link>
        <div className="predict-race-info">
          <span className="predict-round">Round {race.round}</span>
          <h1 className="predict-race-name">{race.name}</h1>
        </div>
      </div>

      <div className="league-economics" style={{ marginBottom: "1.5rem" }}>
        <div className="league-econ-card">
          <span className="league-econ-value">{formatCountdown(qualifyingWindow.lockAt)}</span>
          <span className="league-econ-label">
            Qualifying {qualifyingWindow.paidEdit ? "Live Edit" : qualifyingWindow.locked ? "Closed" : "Locks In"}
          </span>
        </div>
        <div className="league-econ-card">
          <span className="league-econ-value">{formatCountdown(raceWindow.lockAt)}</span>
          <span className="league-econ-label">
            GP {raceWindow.paidEdit ? "Live Edit" : raceWindow.locked ? "Closed" : "Locks In"}
          </span>
        </div>
      </div>

      {isEditing && (
        <div className="predict-edit-banner">
          Editing your predictions. During a live edit window, updates cost ${PREDICTION_EDIT_FEE_USDC} USDC.
        </div>
      )}

      {/* Step tabs */}
      <div className="predict-steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={`predict-step-tab${step === i ? " is-active" : ""}${stepComplete(s) ? " is-done" : ""}`}
            onClick={() => {
              setSectionIncomplete(false);
              setStep(i);
            }}
          >
            <span className="predict-step-icon">
              {stepComplete(s) ? "✓" : STEP_ICONS[s]}
            </span>
            <span>{STEP_LABELS[s]}</span>
          </button>
        ))}
      </div>

      {/* Expert copy CTA — only shown before review step */}
      {currentCategory !== "review" && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem", paddingInline: "1.5rem" }}>
          <button
            className="predict-copy-expert-btn"
            onClick={handleCopyExpert}
            disabled={copyingExpert}
            title="Copy the top player's picks as a starting point, then modify"
          >
            {copyingExpert ? "Loading..." : expertCopied ? "✓ Copied!" : "Copy Expert Picks"}
          </button>
        </div>
      )}

      {/* Questions */}
      <div className="predict-body">
        {currentCategory === "review" ? (
          renderReview()
        ) : currentQuestions.length === 0 ? (
          <div className="predict-empty">
            <p>No {currentCategory} questions available yet.</p>
          </div>
        ) : (
          currentQuestions.map((q) => {
            const picks = (answers[q.id] ?? []).filter(Boolean);
            const isFull = picks.length >= q.multi_select;
            return (
              <div key={q.id} className="predict-question">
                <div className="predict-q-header">
                  <h3 className="predict-q-label">{q.label}</h3>
                  <span className="predict-q-meta">
                    {q.base_points} pts ·{" "}
                    {q.confidence_tier.replace("_", " ")}
                    {q.multi_select > 1 && ` · pick ${q.multi_select}`}
                  </span>
                </div>
                <div className="predict-options">
                  {q.options.map((opt) => {
                    const selected = isOptionSelected(q.id, opt.id);
                    const pickIdx = getPickIndex(q.id, opt.id);
                    const disabled = !currentWindow?.editable || (!selected && isFull);
                    return (
                      <button
                        key={opt.id}
                        disabled={disabled}
                        onClick={() =>
                          handleSelect(q.id, opt.id, q.multi_select, picks)
                        }
                        className={`predict-option${selected ? " is-selected" : ""}${disabled && !selected ? " is-disabled" : ""}`}
                      >
                        {q.multi_select > 1 && selected && (
                          <span className="predict-pick-badge">
                            {pickIdx + 1}
                          </span>
                        )}
                        {opt.option_value}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {currentCategory === "qualifying" && (
          <p className="predict-section-note">
            Qualifying picks lock 10 minutes before qualifying starts. If you already submitted, you can edit for 10 minutes after lights out by paying ${PREDICTION_EDIT_FEE_USDC} USDC.
          </p>
        )}

        {currentCategory === "race" && (
          <p className="predict-section-note">
            GP and chaos picks lock 10 minutes before the Grand Prix. After the start, live edits stay open for 10 minutes with a ${PREDICTION_EDIT_FEE_USDC} USDC fee.
          </p>
        )}

        {currentWindow && !currentWindow.editable && (
          <p className="predict-section-warning">
            This section is locked. Your previously saved picks are still visible, but you can&apos;t change them now.
          </p>
        )}

        {error && <p className="predict-error">{error}</p>}

        {sectionIncomplete && currentCategory !== "review" && (
          <p className="predict-section-warning">
            This section is incomplete. You can still keep moving, but unanswered questions won&apos;t score.
          </p>
        )}

        {/* Navigation */}
        <div className="predict-nav">
          {step > 0 && (
            <button
              className="predict-nav-btn secondary"
              onClick={() => { setSectionIncomplete(false); setStep(step - 1); }}
            >
              ← Back
            </button>
          )}
          {currentCategory === "review" ? (
            <button
              className="predict-nav-btn primary"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : isAuthenticated
                ? anyLiveEditWindow
                  ? `Pay $${PREDICTION_EDIT_FEE_USDC} to Update`
                  : allQuestionsComplete
                    ? isEditing ? "Update Predictions" : "Submit Predictions"
                    : "Save Progress"
                : "Continue to Login →"}
            </button>
          ) : (
            <button
              className="predict-nav-btn primary"
              onClick={() => {
                setSectionIncomplete(!stepComplete(currentCategory as string));
                setStep(step + 1);
              }}
            >
              Next: {STEP_LABELS[STEPS[step + 1]]} →
            </button>
          )}
        </div>

        {!isAuthenticated && (
          <p className="predict-anon-note">
            Your picks are saved locally — log in to lock them in.
          </p>
        )}
      </div>
    </div>
  );
}
