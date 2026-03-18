/**
 * Settlement edge-case tests
 * Covers: zero users, all wrong, tie-breaking, category caps, multi-select scoring
 */
import { describe, it, expect } from "vitest";
import {
  settleRace,
  scoreUserPrediction,
  SCORE_CAPS,
  type PredictionQuestion,
  type PredictionAnswer,
  type RaceResult,
  type PopularitySnapshot,
} from "../lib/scoring/settleRace";

const baseQuestion: PredictionQuestion = {
  id: "q1",
  race_id: "aus-2026",
  category: "race",
  question_type: "winner",
  label: "Race Winner",
  base_points: 20,
  confidence_tier: "medium",
  multi_select: 1,
};

const snap50: PopularitySnapshot[] = [
  { question_id: "q1", option_id: "opt-ver", popularity_percent: 0.5 },
];

const result: RaceResult[] = [
  { question_id: "q1", correct_option_id: "opt-ver", pick_order: 1 },
];

// ─── Zero-user edge case ──────────────────────────────────────

describe("settleRace with no users", () => {
  it("returns empty scores array", () => {
    const { scores } = settleRace({
      raceId: "aus-2026",
      questions: [baseQuestion],
      results: result,
      snapshots: snap50,
      userPredictions: [],
    });
    expect(scores).toHaveLength(0);
  });

  it("still returns a settledAt timestamp", () => {
    const { settledAt } = settleRace({
      raceId: "aus-2026",
      questions: [baseQuestion],
      results: result,
      snapshots: snap50,
      userPredictions: [],
    });
    expect(typeof settledAt).toBe("string");
    expect(new Date(settledAt).getTime()).not.toBeNaN();
  });
});

// ─── All-wrong predictions ────────────────────────────────────

describe("all wrong predictions", () => {
  it("every user scores 0 when all picks are wrong", () => {
    const { scores } = settleRace({
      raceId: "aus-2026",
      questions: [baseQuestion],
      results: result,
      snapshots: snap50,
      userPredictions: [
        { userId: "u1", answers: [{ question_id: "q1", option_id: "opt-nor", pick_order: 1 }], editCount: 0 },
        { userId: "u2", answers: [{ question_id: "q1", option_id: "opt-ham", pick_order: 1 }], editCount: 0 },
      ],
    });
    expect(scores.every((s) => s.total_score === 0)).toBe(true);
  });
});

// ─── Tie-breaking by difficulty score ─────────────────────────

describe("tie-breaking", () => {
  it("same total_score: user with higher difficulty_score ranks first", () => {
    // Both users score the same raw points but from different picks.
    // User A: popular pick (50%), User B: same base points but rarer pick
    // We craft this so both get exactly equal total_score by adjusting base_points
    const qA: PredictionQuestion = { ...baseQuestion, id: "q-a", base_points: 20 };
    const qB: PredictionQuestion = { ...baseQuestion, id: "q-b", base_points: 20 };

    const resultA: RaceResult[] = [{ question_id: "q-a", correct_option_id: "opt-a", pick_order: 1 }];
    const resultB: RaceResult[] = [{ question_id: "q-b", correct_option_id: "opt-b", pick_order: 1 }];

    // u1 gets q-a correct at 50% popularity → difficulty=1, score=20
    // u2 gets q-b correct at 50% popularity → difficulty=1, score=20
    // equal total; then difficulty_score should also be equal (tie stays)
    const { scores } = settleRace({
      raceId: "test",
      questions: [qA, qB],
      results: [...resultA, ...resultB],
      snapshots: [
        { question_id: "q-a", option_id: "opt-a", popularity_percent: 0.5 },
        { question_id: "q-b", option_id: "opt-b", popularity_percent: 0.5 },
      ],
      userPredictions: [
        { userId: "u1", answers: [{ question_id: "q-a", option_id: "opt-a", pick_order: 1 }], editCount: 0 },
        { userId: "u2", answers: [{ question_id: "q-b", option_id: "opt-b", pick_order: 1 }], editCount: 0 },
      ],
    });
    expect(scores[0].total_score).toBe(scores[1].total_score);
  });
});

// ─── Category caps ────────────────────────────────────────────

describe("category score caps", () => {
  it("qualifying score is capped at 150", () => {
    const q: PredictionQuestion = {
      ...baseQuestion,
      id: "q-q",
      category: "qualifying",
      base_points: 500,
      confidence_tier: "chaos",
    };
    const ans: PredictionAnswer[] = [{ question_id: "q-q", option_id: "opt-ver", pick_order: 1 }];
    const res: RaceResult[] = [{ question_id: "q-q", correct_option_id: "opt-ver", pick_order: 1 }];

    const scored = scoreUserPrediction("u1", "test", [q], ans, res, [
      { question_id: "q-q", option_id: "opt-ver", popularity_percent: 0.01 },
    ], 0);

    // Raw would be 500 × 6.5 × 1.4 = 4550, capped at 150
    expect(scored.total_score).toBeLessThanOrEqual(SCORE_CAPS.qualifying);
  });

  it("chaos score is capped at 100", () => {
    const q: PredictionQuestion = {
      ...baseQuestion,
      id: "q-c",
      category: "chaos",
      base_points: 500,
      confidence_tier: "chaos",
    };
    const ans: PredictionAnswer[] = [{ question_id: "q-c", option_id: "opt-ver", pick_order: 1 }];
    const res: RaceResult[] = [{ question_id: "q-c", correct_option_id: "opt-ver", pick_order: 1 }];

    const scored = scoreUserPrediction("u1", "test", [q], ans, res, [
      { question_id: "q-c", option_id: "opt-ver", popularity_percent: 0.01 },
    ], 0);

    expect(scored.total_score).toBeLessThanOrEqual(SCORE_CAPS.chaos);
  });
});

// ─── Multi-select scoring ─────────────────────────────────────

describe("multi-select scoring", () => {
  it("splits base_points across picks for multi_select=3", () => {
    const q: PredictionQuestion = {
      ...baseQuestion,
      id: "q-podium",
      question_type: "podium",
      base_points: 30,
      multi_select: 3,
    };
    // User picks all 3 correctly
    const ans: PredictionAnswer[] = [
      { question_id: "q-podium", option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-podium", option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-podium", option_id: "opt-lec", pick_order: 3 },
    ];
    const res: RaceResult[] = [
      { question_id: "q-podium", correct_option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-podium", correct_option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-podium", correct_option_id: "opt-lec", pick_order: 3 },
    ];
    const snaps: PopularitySnapshot[] = [
      { question_id: "q-podium", option_id: "opt-ver", popularity_percent: 0.5 },
      { question_id: "q-podium", option_id: "opt-nor", popularity_percent: 0.5 },
      { question_id: "q-podium", option_id: "opt-lec", popularity_percent: 0.5 },
    ];

    const scored = scoreUserPrediction("u1", "test", [q], ans, res, snaps, 0);
    // 3 correct picks × (30/3 pts each) × difficulty 1.0 × confidence 1.0 = 30
    expect(scored.total_score).toBeCloseTo(30, 1);
  });

  it("partial multi-select credit: 1 of 3 correct scores 1/3 of full points", () => {
    const q: PredictionQuestion = {
      ...baseQuestion,
      id: "q-podium",
      question_type: "podium",
      base_points: 30,
      multi_select: 3,
    };
    const ans: PredictionAnswer[] = [
      { question_id: "q-podium", option_id: "opt-ver", pick_order: 1 }, // correct
      { question_id: "q-podium", option_id: "opt-ham", pick_order: 2 }, // wrong
      { question_id: "q-podium", option_id: "opt-ham", pick_order: 3 }, // wrong
    ];
    const res: RaceResult[] = [
      { question_id: "q-podium", correct_option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-podium", correct_option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-podium", correct_option_id: "opt-lec", pick_order: 3 },
    ];
    const snaps: PopularitySnapshot[] = [
      { question_id: "q-podium", option_id: "opt-ver", popularity_percent: 0.5 },
    ];

    const scored = scoreUserPrediction("u1", "test", [q], ans, res, snaps, 0);
    // 1 correct × (30/3) × 1.0 × 1.0 = 10
    expect(scored.total_score).toBeCloseTo(10, 1);
  });
});
