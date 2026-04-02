"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppNav } from "@/app/components/AppNav";
import { findRaceById, useRaceCatalog } from "@/lib/raceCatalog";
import {
  parseBreakdown,
  type PredictionComparison,
  type ScoreBreakdown,
  type ScoreBreakdownQuestion,
} from "@/lib/pastRaces";

type RaceScore = {
  total_score: number;
  base_score: number;
  difficulty_score: number;
  edit_penalty: number;
  breakdown_json: ScoreBreakdown | ScoreBreakdownQuestion[] | null;
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

const STATUS_META = {
  correct: { icon: "✓", label: "Correct", color: "#00D2AA" },
  partial: { icon: "△", label: "Partial", color: "#FFB84D" },
  wrong: { icon: "✗", label: "Wrong", color: "#E10600" },
  unanswered: { icon: "—", label: "No Pick", color: "rgba(255,255,255,0.45)" },
} as const;

function categorySum(questions: ScoreBreakdownQuestion[], category: string) {
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
  const { races, loading: racesLoading } = useRaceCatalog();
  const race = findRaceById(races, raceId);

  const [score, setScore] = useState<RaceScore | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [comparisons, setComparisons] = useState<PredictionComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fetchFailed, setFetchFailed] = useState(false);
  const [navProfile, setNavProfile] = useState<{ username: string | null; is_admin: boolean } | null>(null);

  async function load() {
    setError("");
    setFetchFailed(false);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/"); return; }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("username, is_admin")
      .eq("id", user.id)
      .single();
    setNavProfile(profileData);

    const res = await fetch(`/api/scores/${raceId}`);
    if (res.ok) {
      const data = await res.json();
      setScore(data.score);
      setComparisons(data.comparisons ?? []);
      if (data.rank != null) setRank(data.rank as number);
    } else {
      const data = await res.json().catch(() => ({}));
      if (res.status >= 500) {
        setFetchFailed(true);
      }
      setError(data.error ?? "Score not available.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceId, router]);

  if (loading || racesLoading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  if (fetchFailed) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav profile={navProfile} />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <h1 className="gla-page-title">Couldn&apos;t load race scores.</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>An error occurred while loading this race. Please try again.</p>
          <button
            className="gla-race-btn"
            style={{ marginTop: "2rem" }}
            onClick={load}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (error || !score) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "999px",
            padding: "0.4rem 1rem",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: "1.5rem",
          }}>
            Results Pending
          </div>
          <h1 className="gla-page-title">Waiting on the Chequered Flag</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.75rem" }}>
            {error || "This race hasn't been settled yet. Check back after the podium ceremony."}
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
  const comparisonByQuestionId = new Map(
    comparisons.map((comparison) => [comparison.question_id, comparison])
  );

  const editPenaltyApplied = score.edit_penalty < 0.999;

  // Contextual headline copy based on score performance
  const correctCount = questions.filter((q) => q.is_correct).length;
  const totalCount = questions.length;
  const correctRatio = totalCount > 0 ? correctCount / totalCount : 0;

  const scoreHeadline = (() => {
    if (correctRatio >= 0.8) return "Outstanding call. You saw it coming.";
    if (correctRatio >= 0.5) return "Solid read on the race.";
    if (correctRatio > 0) return "Points on the board. Keep pushing.";
    return "Tough one. The cars had other ideas.";
  })();

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={navProfile} />

      {/* Header */}
      <div style={{ padding: "1.5rem 1.5rem 0" }}>
        <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </div>

      <div className="gla-content">
        {/* Results settled banner */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "rgba(0,210,170,0.08)",
          border: "1px solid rgba(0,210,170,0.2)",
          borderRadius: "999px",
          padding: "0.35rem 0.9rem",
          fontSize: "0.65rem",
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "rgba(0,210,170,0.85)",
          marginBottom: "1rem",
        }}>
          <span aria-hidden="true">✓</span> Race Settled
        </div>

        <div style={{ marginBottom: "0.25rem" }}>
          <span className="gla-race-round">Round {race?.round}</span>
        </div>
        <p className="gla-page-title" style={{ marginBottom: "0.25rem" }}>
          {race?.name ?? raceId}
        </p>
        <p className="gla-page-sub">{scoreHeadline}</p>

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
                {rank === 1 ? "You finished P1 — race winner" : rank <= 3 ? "Podium finish" : "Your race position"}
              </span>
              <span style={{ fontSize: "1.6rem", fontWeight: 900, color: "#00D2AA" }}>
                P{rank}
              </span>
            </div>
            <Link href="/leaderboard" className="gla-race-btn" style={{ fontSize: "0.65rem", padding: "0.6rem 1.1rem" }}>
              See the full grid →
            </Link>
          </div>
        )}

        {/* Category summary */}
        <div className="scores-category-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "0.75rem", marginBottom: "2rem" }}>
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
                  (() => {
                    const comparison = comparisonByQuestionId.get(q.question_id);
                    const status = STATUS_META[comparison?.status ?? (q.is_correct ? "correct" : "wrong")];

                    return (
                      <div
                        key={q.question_id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5rem minmax(0, 1fr) auto",
                          alignItems: "start",
                          gap: "0.75rem",
                          background: "rgba(255,255,255,0.03)",
                          border: `1px solid ${q.raw_score > 0 ? `${CATEGORY_COLORS[cat]}33` : "rgba(255,255,255,0.06)"}`,
                          borderRadius: "8px",
                          padding: "0.85rem 1rem",
                        }}
                      >
                        <span style={{ fontSize: "0.9rem", textAlign: "center", color: status.color }}>
                          {status.icon}
                        </span>

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#fff" }}>
                              {q.label ?? q.question_type.replace(/_/g, " ")}
                            </div>
                            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: status.color }}>
                              {status.label}
                            </div>
                          </div>

                          {comparison && (
                            <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.55rem" }}>
                              <div>
                                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>
                                  Your pick
                                </div>
                                <div style={{ fontSize: "0.8rem", color: "#fff", marginTop: "0.15rem" }}>
                                  {comparison.user_pick ?? "No pick submitted"}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>
                                  Actual result
                                </div>
                                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", marginTop: "0.15rem" }}>
                                  {comparison.actual_result ?? "Result unavailable"}
                                </div>
                              </div>
                            </div>
                          )}

                          {q.raw_score > 0 && (q.difficulty_multiplier !== 1 || q.confidence_multiplier !== 1) && (
                            <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.35)", marginTop: "0.55rem" }}>
                              {q.difficulty_multiplier !== 1 && `diff ${formatMultiplier(q.difficulty_multiplier)}`}
                              {q.difficulty_multiplier !== 1 && q.confidence_multiplier !== 1 && " · "}
                              {q.confidence_multiplier !== 1 && `conf ${formatMultiplier(q.confidence_multiplier)}`}
                            </div>
                          )}
                        </div>

                        <div style={{
                          fontSize: "1rem",
                          fontWeight: 800,
                          color: q.raw_score > 0 ? "#fff" : "rgba(255,255,255,0.2)",
                          textAlign: "right",
                          minWidth: "3.5rem",
                        }}>
                          {q.raw_score > 0 ? `+${q.raw_score.toFixed(1)}` : "0"}
                        </div>
                      </div>
                    );
                  })()
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
