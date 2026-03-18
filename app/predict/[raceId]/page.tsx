"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";

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

const STEPS = ["qualifying", "race", "chaos"] as const;
const STEP_LABELS: Record<string, string> = {
  qualifying: "Qualifying",
  race: "Race",
  chaos: "Chaos",
};
const STEP_ICONS: Record<string, string> = {
  qualifying: "Q",
  race: "R",
  chaos: "⚡",
};

export default function PredictPage() {
  const params = useParams();
  const router = useRouter();
  const raceId = params?.raceId as string;
  const race = races.find((r) => r.id === raceId);

  const [step, setStep] = useState(0);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const currentCategory = STEPS[step];
  const currentQuestions = questions.filter(
    (q) => q.category === currentCategory
  );

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
      .select("race_locked")
      .eq("id", raceId)
      .single();
    if (raceRow?.race_locked) setIsLocked(true);

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

        if (ansData) {
          const loaded: Answers = {};
          for (const ans of ansData) {
            if (!loaded[ans.question_id]) loaded[ans.question_id] = [];
            loaded[ans.question_id][ans.pick_order - 1] = ans.option_id;
          }
          setAnswers(loaded);
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
      if (multiSelect === 1) {
        return { ...prev, [questionId]: [optionId] };
      }
      const existing = picks.indexOf(optionId);
      if (existing !== -1) {
        picks.splice(existing, 1);
      } else if (picks.filter(Boolean).length < multiSelect) {
        picks.push(optionId);
      }
      return { ...prev, [questionId]: picks.filter(Boolean) };
    });
    void currentPicks; // suppress lint
  }

  function isOptionSelected(questionId: string, optionId: string) {
    return (answers[questionId] ?? []).includes(optionId);
  }

  function getPickIndex(questionId: string, optionId: string) {
    return (answers[questionId] ?? []).indexOf(optionId);
  }

  function stepComplete(category: string) {
    const qs = questions.filter((q) => q.category === category);
    if (qs.length === 0) return true;
    return qs.every((q) => {
      const picks = (answers[q.id] ?? []).filter(Boolean);
      return picks.length >= q.multi_select;
    });
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
      localStorage.removeItem(`picks_${raceId}`);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>Loading...</p>
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
            Predictions Locked In
          </h1>
          <p className="gla-page-sub">
            {race.name} · Round {race.round}
          </p>
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              marginTop: "2rem",
              flexWrap: "wrap",
            }}
          >
            <Link href="/leagues" className="gla-race-btn">
              Join a League
            </Link>
            <Link
              href="/dashboard"
              className="gla-race-btn"
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              Back to Dashboard
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

      {/* Step tabs */}
      <div className="predict-steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={`predict-step-tab${step === i ? " is-active" : ""}${stepComplete(s) ? " is-done" : ""}`}
            onClick={() => setStep(i)}
          >
            <span className="predict-step-icon">
              {stepComplete(s) ? "✓" : STEP_ICONS[s]}
            </span>
            <span>{STEP_LABELS[s]}</span>
          </button>
        ))}
      </div>

      {/* Questions */}
      <div className="predict-body">
        {isLocked && (
          <div className="predict-locked-banner">
            🔒 Predictions are locked for this race
          </div>
        )}

        {currentQuestions.length === 0 ? (
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
                    const disabled = isLocked || (!selected && isFull);
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

        {error && <p className="predict-error">{error}</p>}

        {/* Navigation */}
        <div className="predict-nav">
          {step > 0 && (
            <button
              className="predict-nav-btn secondary"
              onClick={() => setStep(step - 1)}
            >
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              className="predict-nav-btn primary"
              onClick={() => setStep(step + 1)}
            >
              Next: {STEP_LABELS[STEPS[step + 1]]} →
            </button>
          ) : (
            <button
              className="predict-nav-btn primary"
              onClick={handleSubmit}
              disabled={saving || isLocked}
            >
              {saving
                ? "Saving..."
                : isAuthenticated
                ? "Lock In Predictions"
                : "Continue to Login →"}
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
