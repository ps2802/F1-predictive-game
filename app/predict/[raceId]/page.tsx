"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races, driverInfo } from "@/lib/races";
import { track } from "@/lib/analytics";

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

// Checks if an option is a driver-type pick based on option_value matching known drivers
function isDriverOption(opts: Option[]): boolean {
  if (opts.length === 0) return false;
  const driverNames = driverInfo.map((d) => d.name.toLowerCase());
  return opts.some((o) => driverNames.includes(o.option_value.toLowerCase()));
}

function getDriverInfo(name: string) {
  return driverInfo.find(
    (d) => d.name.toLowerCase() === name.toLowerCase()
  );
}

// ── Countdown timer ────────────────────────────────────────────────────────────
function useCountdown(deadline: string | null) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!deadline) return;
    const target = new Date(deadline).getTime();

    function update() {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft("Locked");
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${mins}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      } else {
        setTimeLeft(`${mins}m ${secs}s`);
      }
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return timeLeft;
}

// ── Searchable driver dropdown ─────────────────────────────────────────────────
function DriverDropdown({
  options,
  selected,
  onSelect,
  multiSelect,
  disabled,
}: {
  options: Option[];
  selected: string[];
  onSelect: (optionId: string) => void;
  multiSelect: number;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter((o) =>
    o.option_value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOptions = options.filter((o) => selected.includes(o.id));

  const displayText =
    selectedOptions.length === 0
      ? "Select driver…"
      : selectedOptions.map((o) => o.option_value).join(", ");

  return (
    <div className="driver-dd" ref={ref}>
      <button
        type="button"
        className={`driver-dd-trigger${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}`}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        disabled={disabled}
      >
        <span className="driver-dd-value">{displayText}</span>
        <span className="driver-dd-arrow">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="driver-dd-panel">
          <div className="driver-dd-search-wrap">
            <input
              className="driver-dd-search"
              placeholder="Search driver…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="driver-dd-list">
            {filtered.length === 0 ? (
              <div className="driver-dd-empty">No drivers found</div>
            ) : (
              filtered.map((opt) => {
                const info = getDriverInfo(opt.option_value);
                const isSelected = selected.includes(opt.id);
                const isFull = !isSelected && selected.length >= multiSelect;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isFull}
                    className={`driver-dd-item${isSelected ? " is-selected" : ""}${isFull ? " is-disabled" : ""}`}
                    onClick={() => {
                      onSelect(opt.id);
                      if (multiSelect === 1) {
                        setOpen(false);
                        setSearch("");
                      }
                    }}
                  >
                    {info && (
                      <span
                        className="driver-dd-num"
                        style={{ borderColor: info.teamColor, color: info.teamColor }}
                      >
                        {info.number}
                      </span>
                    )}
                    <span className="driver-dd-name">{opt.option_value}</span>
                    {info && (
                      <span
                        className="driver-dd-team"
                        style={{ color: info.teamColor }}
                      >
                        {info.team}
                      </span>
                    )}
                    {isSelected && <span className="driver-dd-check">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
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
  const [stepError, setStepError] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [alreadyPredicted, setAlreadyPredicted] = useState(false);
  const [qualifyingDeadline, setQualifyingDeadline] = useState<string | null>(null);

  const currentCategory = STEPS[step];
  const currentQuestions = questions.filter(
    (q) => q.category === currentCategory
  );
  const countdown = useCountdown(qualifyingDeadline);

  const loadData = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setIsAuthenticated(!!user);

    const [{ data: qData }, { data: raceRow }] = await Promise.all([
      supabase
        .from("prediction_questions")
        .select("*, options:prediction_options(*)")
        .eq("race_id", raceId)
        .order("display_order"),
      supabase
        .from("races")
        .select("race_locked, qualifying_starts_at")
        .eq("id", raceId)
        .single(),
    ]);

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

    if (raceRow) {
      const manuallyLocked = raceRow.race_locked === true;
      const pastDeadline =
        raceRow.qualifying_starts_at != null &&
        new Date() >= new Date(raceRow.qualifying_starts_at);
      if (manuallyLocked || pastDeadline) {
        setIsLocked(true);
      } else if (raceRow.qualifying_starts_at) {
        setQualifyingDeadline(raceRow.qualifying_starts_at);
      }
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
        setAlreadyPredicted(true);
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
    multiSelect: number
  ) {
    setAnswers((prev) => {
      const picks = [...(prev[questionId] ?? [])];
      if (multiSelect === 1) {
        // Toggle single-select: clicking selected option unselects it
        if (picks[0] === optionId) {
          return { ...prev, [questionId]: [] };
        }
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

  function getMissingQuestions(category: string): string[] {
    return questions
      .filter((q) => q.category === category)
      .filter((q) => (answers[q.id] ?? []).filter(Boolean).length < q.multi_select)
      .map((q) => q.label);
  }

  function handleNextStep() {
    const missing = getMissingQuestions(currentCategory);
    if (missing.length > 0) {
      setStepError(
        `Please answer all questions before continuing. Missing: ${missing.slice(0, 2).join(", ")}${missing.length > 2 ? " and more" : ""}.`
      );
      return;
    }
    setStepError("");
    setStep(step + 1);
  }

  async function handleSubmit() {
    // Validate all steps before submitting
    const allMissing: string[] = [];
    for (const cat of STEPS) {
      allMissing.push(...getMissingQuestions(cat));
    }
    if (allMissing.length > 0) {
      setError(
        `Please answer all questions before submitting. ${allMissing.length} unanswered question${allMissing.length > 1 ? "s" : ""} remaining.`
      );
      return;
    }

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
      setSaved(true);
      setAlreadyPredicted(true);
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
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "5rem" }}>
          {/* Lock banner */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(225,6,0,0.12)",
            border: "1px solid rgba(225,6,0,0.35)",
            borderRadius: "999px",
            padding: "0.4rem 1rem",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#E10600",
            marginBottom: "2rem",
          }}>
            <span aria-hidden="true">●</span> Qualifying Underway
          </div>

          <h1 className="gla-page-title" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
            Predictions Locked
          </h1>
          <p style={{
            fontSize: "1.05rem",
            color: "rgba(255,255,255,0.55)",
            marginTop: "0.75rem",
            lineHeight: 1.5,
          }}>
            The grid is set. Results coming soon.
          </p>

          {/* Race identity */}
          <div style={{
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.25rem",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "1.25rem 2.5rem",
            marginTop: "2.5rem",
            marginBottom: "2.5rem",
          }}>
            <span style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>
              Round {race.round}
            </span>
            <span style={{ fontSize: "1.3rem", fontWeight: 900, color: "#fff", letterSpacing: "-0.01em" }}>
              {race.name}
            </span>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/dashboard" className="gla-race-btn">
              ← All Races
            </Link>
            <Link
              href="/leaderboard"
              className="gla-race-btn"
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              Leaderboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (saved) {
    const submittedCategories = STEPS.filter((s) => stepComplete(s));
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "5rem" }}>
          {/* Confirmation badge */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(0,210,170,0.1)",
            border: "1px solid rgba(0,210,170,0.3)",
            borderRadius: "999px",
            padding: "0.4rem 1rem",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(0,210,170,1)",
            marginBottom: "2rem",
          }}>
            <span aria-hidden="true">✓</span> Locked In
          </div>

          <h1 className="gla-page-title" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
            Predictions Locked In
          </h1>
          <p style={{
            fontSize: "1.05rem",
            color: "rgba(255,255,255,0.55)",
            marginTop: "0.75rem",
            lineHeight: 1.5,
          }}>
            May the fastest picks win.
          </p>

          {/* Race identity + prediction summary */}
          <div style={{
            background: "rgba(0,210,170,0.05)",
            border: "1px solid rgba(0,210,170,0.15)",
            borderRadius: "12px",
            padding: "1.5rem 2rem",
            marginTop: "2.5rem",
            marginBottom: "2.5rem",
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
            minWidth: "240px",
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
              <span style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.35)", fontWeight: 700 }}>
                Round {race.round}
              </span>
              <span style={{ fontSize: "1.2rem", fontWeight: 900, color: "#fff" }}>{race.name}</span>
            </div>
            {/* Category completion indicators */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {STEPS.map((s) => (
                <span key={s} style={{
                  fontSize: "0.65rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "0.3rem 0.7rem",
                  borderRadius: "6px",
                  background: submittedCategories.includes(s) ? "rgba(0,210,170,0.15)" : "rgba(255,255,255,0.05)",
                  color: submittedCategories.includes(s) ? "rgba(0,210,170,1)" : "rgba(255,255,255,0.3)",
                  border: submittedCategories.includes(s) ? "1px solid rgba(0,210,170,0.3)" : "1px solid rgba(255,255,255,0.08)",
                }}>
                  {submittedCategories.includes(s) ? "✓ " : ""}{STEP_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)", marginBottom: "2rem" }}>
            Predictions close when qualifying starts. You can still edit until then.
          </p>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/leagues" className="gla-race-btn">
              Join a League
            </Link>
            <Link
              href="/dashboard"
              className="gla-race-btn"
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}
            >
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
          <span className="predict-round">Round {race.round} · {race.flag} {race.country}</span>
          <h1 className="predict-race-name">{race.name}</h1>
        </div>

        {/* Countdown timer */}
        {qualifyingDeadline && countdown && countdown !== "Locked" && (
          <div className="predict-countdown">
            <span className="predict-countdown-label">Closes in</span>
            <span className="predict-countdown-value">{countdown}</span>
          </div>
        )}
      </div>

      {/* Already predicted banner */}
      {alreadyPredicted && !saved && (
        <div className="predict-already-banner">
          ✓ You&apos;ve already submitted predictions for this race. You can update them below until the window closes.
        </div>
      )}

      {/* Step tabs */}
      <div className="predict-steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={`predict-step-tab${step === i ? " is-active" : ""}${stepComplete(s) ? " is-done" : ""}`}
            onClick={() => {
              setStepError("");
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

      {/* Step context note for Race step */}
      {currentCategory === "race" && (
        <div className="predict-step-note">
          <strong>Race predictions</strong> — These are for the race day (typically a day after qualifying). You can update all predictions until the qualifying window closes.
        </div>
      )}

      {/* Questions */}
      <div className="predict-body">
        {currentQuestions.length === 0 ? (
          <div className="predict-empty">
            <p>No {currentCategory} questions available yet.</p>
          </div>
        ) : (
          currentQuestions.map((q) => {
            const picks = (answers[q.id] ?? []).filter(Boolean);
            const isFull = picks.length >= q.multi_select;
            const useDropdown = isDriverOption(q.options);

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

                {useDropdown ? (
                  <DriverDropdown
                    options={q.options}
                    selected={answers[q.id] ?? []}
                    onSelect={(optionId) => handleSelect(q.id, optionId, q.multi_select)}
                    multiSelect={q.multi_select}
                    disabled={isLocked}
                  />
                ) : (
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
                            handleSelect(q.id, opt.id, q.multi_select)
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
                )}
              </div>
            );
          })
        )}

        {stepError && <p className="predict-step-error">{stepError}</p>}
        {error && <p className="predict-error">{error}</p>}

        {/* Navigation */}
        <div className="predict-nav">
          {step > 0 && (
            <button
              className="predict-nav-btn secondary"
              onClick={() => { setStepError(""); setStep(step - 1); }}
            >
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              className="predict-nav-btn primary"
              onClick={handleNextStep}
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
                ? "Saving…"
                : isAuthenticated
                ? alreadyPredicted
                  ? "Update Predictions"
                  : "Lock In Predictions"
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
