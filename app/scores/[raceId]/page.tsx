"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";

type ScoredQuestion = {
  question_id: string;
  question_type: string;
  category: "qualifying" | "race" | "chaos";
  base_points: number;
  difficulty_multiplier: number;
  confidence_multiplier: number;
  raw_score: number;
  is_correct: boolean;
  label?: string;
};

type BreakdownJson =
  | { questions: ScoredQuestion[]; chaos_bonus: number }
  | ScoredQuestion[]; // legacy shape before Task 5

type RaceScore = {
  total_score: number;
  base_score: number;
  difficulty_score: number;
  edit_penalty: number;
  breakdown_json: BreakdownJson | null;
  calculated_at: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  qualifying: "Qualifying",
  race: "Race",
  chaos: "Chaos",
};

const CATEGORY_COLORS: Record<string, string> = {
  qualifying: "#3b82f6",
  race: "#E10600",
  chaos: "#a855f7",
};

function parseBreakdown(raw: BreakdownJson | null): { questions: ScoredQuestion[]; chaos_bonus: number } {
  if (!raw) return { questions: [], chaos_bonus: 0 };
  if (Array.isArray(raw)) return { questions: raw, chaos_bonus: 0 };
  return { questions: raw.questions ?? [], chaos_bonus: raw.chaos_bonus ?? 0 };
}

function categorySum(questions: ScoredQuestion[], category: string) {
  return questions
    .filter((q) => q.category === category)
    .reduce((sum, q) => sum + q.raw_score, 0);
}

function formatMultiplier(n: number) {
  return `×${n.toFixed(2)}`;
}

export default function ScoreBreakdownPage() {
  const params = useParams();
  const router = useRouter();
  const raceId = params?.raceId as string;
  const race = races.find((r) => r.id === raceId);

  const [score, setScore] = useState<RaceScore | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const res = await fetch(`/api/scores/${raceId}`);
      if (res.ok) {
        const data = await res.json();
        setScore(data.score);
        if (data.rank != null) setRank(data.rank as number);
      } else {
        const data = await res.json();
        setError(data.error ?? "Score not available.");
      }
      setLoading(false);
    }
    load();
  }, [raceId, router]);

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  if (error || !score) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <p style={{ fontSize: "2rem", marginBottom: "1rem" }}>📭</p>
          <h1 className="gla-page-title">No score yet</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>
            {error || "This race hasn't been settled yet."}
          </p>
          <Link href="/profile" className="gla-race-btn" style={{ marginTop: "2rem", display: "inline-block" }}>
            Back to Profile
          </Link>
        </div>
      </div>
    );
  }

  const { questions, chaos_bonus } = parseBreakdown(score.breakdown_json);
  const categories = ["qualifying", "race", "chaos"] as const;

  const editPenaltyApplied = score.edit_penalty < 0.999;

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />

      {/* Header */}
      <div style={{ padding: "1.5rem 1.5rem 0" }}>
        <Link href="/profile" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Profile
        </Link>
      </div>

      <div className="gla-content">
        <div style={{ marginBottom: "0.25rem" }}>
          <span className="gla-race-round">Round {race?.round}</span>
        </div>
        <p className="gla-page-title" style={{ marginBottom: "0.25rem" }}>
          {race?.name ?? raceId}
        </p>
        <p className="gla-page-sub">Score breakdown</p>

        {/* Total score hero */}
        <div style={{
          background: "rgba(225,6,0,0.08)",
          border: "1px solid rgba(225,6,0,0.2)",
          borderRadius: "12px",
          padding: "1.5rem",
          textAlign: "center",
          margin: "1.5rem 0",
        }}>
          <div style={{ fontSize: "3.5rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>
            {score.total_score.toFixed(1)}
          </div>
          <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginTop: "0.5rem" }}>
            Total Score
          </div>
          {chaos_bonus > 0 && (
            <div style={{ marginTop: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "999px", padding: "0.3rem 0.9rem", fontSize: "0.8rem", color: "#c084fc" }}>
              ⚡ Chaos Bonus +{chaos_bonus} pts
            </div>
          )}
          {editPenaltyApplied && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.35)" }}>
              Edit penalty applied: ×{score.edit_penalty.toFixed(2)}
            </div>
          )}
        </div>

        {/* Race rank banner — shown once rank is known */}
        {rank != null && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            background: "rgba(0,210,170,0.07)",
            border: "1px solid rgba(0,210,170,0.2)",
            borderRadius: "10px",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
          }}>
            <div>
              <span style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(0,210,170,0.7)", display: "block", marginBottom: "0.2rem" }}>
                Your rank this race
              </span>
              <span style={{ fontSize: "1.6rem", fontWeight: 900, color: "#00D2AA" }}>
                #{rank}
              </span>
            </div>
            <Link href="/leaderboard" className="gla-race-btn" style={{ fontSize: "0.65rem", padding: "0.6rem 1.1rem" }}>
              Full Leaderboard →
            </Link>
          </div>
        )}

        {/* Category summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "2rem" }}>
          {categories.map((cat) => {
            const raw = categorySum(questions, cat);
            const correct = questions.filter((q) => q.category === cat && q.is_correct).length;
            const total = questions.filter((q) => q.category === cat).length;
            return (
              <div key={cat} style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${CATEGORY_COLORS[cat]}33`,
                borderTop: `2px solid ${CATEGORY_COLORS[cat]}`,
                borderRadius: "8px",
                padding: "0.875rem",
                textAlign: "center",
              }}>
                <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#fff" }}>{raw.toFixed(1)}</div>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: CATEGORY_COLORS[cat], marginTop: "0.2rem" }}>
                  {CATEGORY_LABELS[cat]}
                </div>
                <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginTop: "0.2rem" }}>
                  {correct}/{total} correct
                </div>
              </div>
            );
          })}
        </div>

        {/* Per-question breakdown by category */}
        {categories.map((cat) => {
          const catQuestions = questions.filter((q) => q.category === cat);
          if (catQuestions.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: "2rem" }}>
              <h3 style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: CATEGORY_COLORS[cat],
                marginBottom: "0.75rem",
                fontWeight: 700,
              }}>
                {CATEGORY_LABELS[cat]}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {catQuestions.map((q) => (
                  <div
                    key={q.question_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.5rem 1fr auto",
                      alignItems: "center",
                      gap: "0.75rem",
                      background: q.is_correct
                        ? "rgba(255,255,255,0.05)"
                        : "rgba(255,255,255,0.02)",
                      border: `1px solid ${q.is_correct ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}`,
                      borderRadius: "8px",
                      padding: "0.75rem 1rem",
                    }}
                  >
                    {/* correct/wrong indicator */}
                    <span style={{ fontSize: "0.9rem", textAlign: "center" }}>
                      {q.is_correct ? "✓" : "✗"}
                    </span>

                    {/* question info */}
                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: q.is_correct ? "#fff" : "rgba(255,255,255,0.4)" }}>
                        {q.label ?? q.question_type.replace(/_/g, " ")}
                      </div>
                      {q.is_correct && (
                        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginTop: "0.15rem" }}>
                          diff {formatMultiplier(q.difficulty_multiplier)}
                          {q.confidence_multiplier !== 1 && ` · conf ${formatMultiplier(q.confidence_multiplier)}`}
                        </div>
                      )}
                    </div>

                    {/* score */}
                    <div style={{
                      fontSize: "1rem",
                      fontWeight: 800,
                      color: q.is_correct ? "#fff" : "rgba(255,255,255,0.2)",
                      textAlign: "right",
                      minWidth: "3.5rem",
                    }}>
                      {q.is_correct ? `+${q.raw_score.toFixed(1)}` : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Footer nav */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
          <Link href="/leaderboard" className="gla-race-btn">
            Leaderboard
          </Link>
          <Link href="/profile" className="gla-race-btn" style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)" }}>
            Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
