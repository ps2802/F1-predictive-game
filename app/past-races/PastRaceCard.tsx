"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PastRaceData,
  getMainPredictions,
  type PredictionComparison,
} from "@/lib/pastRaces";

type Props = {
  race: PastRaceData;
};

const CATEGORY_LABELS: Record<string, string> = {
  qualifying: "Qualifying",
  race: "Race",
  chaos: "Chaos",
};

const STATUS_META = {
  correct: {
    icon: "✓",
    label: "Correct",
    color: "rgba(0,210,170,0.85)",
    border: "rgba(0,210,170,0.3)",
    background: "rgba(0,210,170,0.08)",
  },
  partial: {
    icon: "△",
    label: "Partial",
    color: "rgba(255,184,77,0.9)",
    border: "rgba(255,184,77,0.32)",
    background: "rgba(255,184,77,0.1)",
  },
  wrong: {
    icon: "✗",
    label: "Wrong",
    color: "rgba(225,6,0,0.85)",
    border: "rgba(225,6,0,0.28)",
    background: "rgba(225,6,0,0.08)",
  },
  unanswered: {
    icon: "—",
    label: "No Pick",
    color: "rgba(255,255,255,0.5)",
    border: "rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
  },
} as const;

function formatPredictionValue(value: string | null) {
  return value ?? "No pick submitted";
}

function buildStatusCounts(comparisons: PredictionComparison[]) {
  return comparisons.reduce(
    (counts, comparison) => {
      counts[comparison.status] += 1;
      return counts;
    },
    {
      correct: 0,
      partial: 0,
      wrong: 0,
      unanswered: 0,
    }
  );
}

export function PastRaceCard({ race }: Props) {
  const [expanded, setExpanded] = useState(false);
  const mainPredictions = getMainPredictions(race.comparisons);
  const statusCounts = buildStatusCounts(race.comparisons);
  const comparisonsByCategory = {
    qualifying: race.comparisons.filter((comparison) => comparison.category === "qualifying"),
    race: race.comparisons.filter((comparison) => comparison.category === "race"),
    chaos: race.comparisons.filter((comparison) => comparison.category === "chaos"),
  } as const;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "12px",
        overflow: "hidden",
        transition: "all 0.2s ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "rgba(255,255,255,0.06)";
        event.currentTarget.style.borderColor = "rgba(0,210,170,0.3)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "rgba(255,255,255,0.04)";
        event.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
      }}
    >
      <div style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1.5rem" }}>{race.flag}</span>
              <div>
                <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(0,210,170,0.7)" }}>
                  Round {race.round}
                </div>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}>
                  {race.name}
                </div>
              </div>
            </div>
            <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: "0.5rem" }}>
              {new Date(race.race_starts_at || race.race_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>

          <div style={{
            background: "rgba(225,6,0,0.12)",
            border: "1px solid rgba(225,6,0,0.3)",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            textAlign: "center",
            minWidth: "80px",
          }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#fff", lineHeight: 1 }}>
              {race.total_score?.toFixed(1) ?? "—"}
            </div>
            <div style={{ fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(225,6,0,0.7)", marginTop: "0.3rem" }}>
              Pts
            </div>
          </div>
        </div>

        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "0.75rem" }}>
            Main Predictions
          </div>

          {mainPredictions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {mainPredictions.slice(0, 2).map((prediction) => {
                const status = STATUS_META[prediction.status];
                return (
                  <div key={prediction.question_id} style={{ display: "grid", gridTemplateColumns: "1rem 1fr", gap: "0.5rem", fontSize: "0.8rem" }}>
                    <span style={{ color: status.color }}>{status.icon}</span>
                    <div>
                      <span style={{ color: "rgba(255,255,255,0.65)" }}>{prediction.label}: </span>
                      <span style={{ color: "#fff" }}>{formatPredictionValue(prediction.user_pick)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>
              No settled picks to review
            </div>
          )}
        </div>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "1rem",
          paddingTop: "1rem",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          gap: "1rem",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {statusCounts.correct > 0 && (
              <span style={{ fontSize: "0.7rem", color: STATUS_META.correct.color }}>
                {statusCounts.correct} correct
              </span>
            )}
            {statusCounts.partial > 0 && (
              <span style={{ fontSize: "0.7rem", color: STATUS_META.partial.color }}>
                {statusCounts.partial} partial
              </span>
            )}
            {statusCounts.wrong > 0 && (
              <span style={{ fontSize: "0.7rem", color: STATUS_META.wrong.color }}>
                {statusCounts.wrong} wrong
              </span>
            )}
            {statusCounts.unanswered > 0 && (
              <span style={{ fontSize: "0.7rem", color: STATUS_META.unanswered.color }}>
                {statusCounts.unanswered} missed
              </span>
            )}
          </div>

          <button
            onClick={() => setExpanded((current) => !current)}
            style={{
              background: "transparent",
              border: "1px solid rgba(0,210,170,0.4)",
              color: "rgba(0,210,170,0.8)",
              borderRadius: "6px",
              padding: "0.6rem 0.9rem",
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "rgba(0,210,170,0.1)";
              event.currentTarget.style.borderColor = "rgba(0,210,170,0.6)";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
              event.currentTarget.style.borderColor = "rgba(0,210,170,0.4)";
            }}
          >
            {expanded ? "Hide Review" : "Review Picks"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.1)",
          padding: "1.25rem",
          background: "rgba(255,255,255,0.02)",
        }}>
          {(["qualifying", "race", "chaos"] as const).map((category) => {
            const categoryComparisons = comparisonsByCategory[category];
            if (categoryComparisons.length === 0) {
              return null;
            }

            return (
              <div key={category} style={{ marginBottom: "1.5rem" }}>
                <div style={{
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "0.75rem",
                }}>
                  {CATEGORY_LABELS[category]}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {categoryComparisons.map((comparison) => {
                    const status = STATUS_META[comparison.status];
                    return (
                      <div
                        key={comparison.question_id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5rem minmax(0, 1fr) auto",
                          gap: "0.75rem",
                          alignItems: "start",
                          padding: "0.9rem",
                          background: status.background,
                          border: `1px solid ${status.border}`,
                          borderRadius: "8px",
                        }}
                      >
                        <span style={{ color: status.color, fontSize: "0.95rem", lineHeight: 1.3 }}>
                          {status.icon}
                        </span>

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff" }}>
                              {comparison.label}
                            </span>
                            <span style={{
                              fontSize: "0.65rem",
                              color: status.color,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                            }}>
                              {status.label}
                            </span>
                          </div>

                          <div style={{ marginTop: "0.55rem", display: "grid", gap: "0.45rem" }}>
                            <div style={{ display: "grid", gap: "0.15rem" }}>
                              <span style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>
                                Your pick
                              </span>
                              <span style={{ fontSize: "0.8rem", color: "#fff" }}>
                                {formatPredictionValue(comparison.user_pick)}
                              </span>
                            </div>

                            <div style={{ display: "grid", gap: "0.15rem" }}>
                              <span style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>
                                Actual result
                              </span>
                              <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)" }}>
                                {formatPredictionValue(comparison.actual_result)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: "right", minWidth: "4rem" }}>
                          <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>
                            Points
                          </div>
                          <div style={{ fontSize: "1rem", fontWeight: 800, color: comparison.points_earned > 0 ? "#fff" : "rgba(255,255,255,0.35)", marginTop: "0.25rem" }}>
                            {comparison.points_earned > 0 ? `+${comparison.points_earned.toFixed(1)}` : "0"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            {race.breakdown.chaos_bonus > 0 && (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "rgba(168,85,247,0.15)",
                border: "1px solid rgba(168,85,247,0.3)",
                borderRadius: "999px",
                padding: "0.4rem 1rem",
                fontSize: "0.8rem",
                color: "#c084fc",
              }}>
                Chaos Bonus +{race.breakdown.chaos_bonus}
              </div>
            )}

            {race.edit_penalty != null && race.edit_penalty < 0.999 && (
              <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.45)" }}>
                Final score includes edit penalty ×{race.edit_penalty.toFixed(2)}
              </div>
            )}
          </div>

          <Link
            href={`/scores/${race.race_id}`}
            style={{
              display: "inline-block",
              marginTop: "1rem",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "rgba(0,210,170,0.8)",
              textDecoration: "none",
              borderBottom: "1px solid rgba(0,210,170,0.3)",
              paddingBottom: "0.2rem",
            }}
          >
            View Full Breakdown →
          </Link>
        </div>
      )}
    </div>
  );
}
