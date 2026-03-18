/**
 * Scoring Engine Tests
 * Run: npm test
 */
import { describe, it, expect } from "vitest";
import {
  difficultyMultiplier,
  editPenalty,
  confidenceMultiplier,
  scoreQuestion,
  scoreUserPrediction,
  settleRace,
  SCORE_CAPS,
  MAX_DIFFICULTY_MULTIPLIER,
  type PredictionQuestion,
  type PredictionAnswer,
  type RaceResult,
  type PopularitySnapshot,
} from "../lib/scoring/settleRace";

// ─── Test fixtures ───────────────────────────────────────────

const baseQuestion: PredictionQuestion = {
  id: "q-winner",
  race_id: "australia-2026",
  category: "race",
  question_type: "winner",
  label: "Race Winner",
  base_points: 20,
  confidence_tier: "medium",
  multi_select: 1,
};

// option IDs used directly in PredictionAnswer objects below (not as objects)

// ─── difficultyMultiplier ─────────────────────────────────────

describe("difficultyMultiplier", () => {
  it("returns MAX when popularity is 0", () => {
    expect(difficultyMultiplier(0)).toBe(MAX_DIFFICULTY_MULTIPLIER);
  });

  it("returns log2(2) = 1 when popularity is 0.5", () => {
    expect(difficultyMultiplier(0.5)).toBeCloseTo(1.0, 5);
  });

  it("returns log2(4) = 2 when popularity is 0.25", () => {
    expect(difficultyMultiplier(0.25)).toBeCloseTo(2.0, 5);
  });

  it("caps at MAX_DIFFICULTY_MULTIPLIER for very rare picks", () => {
    expect(difficultyMultiplier(0.0001)).toBe(MAX_DIFFICULTY_MULTIPLIER);
  });

  it("returns 0 when popularity is 1 (everyone picked it)", () => {
    expect(difficultyMultiplier(1)).toBeCloseTo(0, 5);
  });
});

// ─── editPenalty ──────────────────────────────────────────────

describe("editPenalty", () => {
  it("is exactly 1.0 with 0 edits", () => {
    expect(editPenalty(0)).toBe(1.0);
  });

  it("decreases with more edits", () => {
    const one = editPenalty(1);
    const five = editPenalty(5);
    expect(one).toBeGreaterThan(five);
  });

  it("is never zero or negative", () => {
    expect(editPenalty(100)).toBeGreaterThan(0);
  });

  it("formula: 1 / (1 + 1*0.08) = 1/1.08 ≈ 0.9259 for 1 edit", () => {
    expect(editPenalty(1)).toBeCloseTo(1 / 1.08, 4);
  });
});

// ─── confidenceMultiplier ─────────────────────────────────────

describe("confidenceMultiplier", () => {
  it("low_variance returns 0.9", () => {
    expect(confidenceMultiplier("low_variance")).toBe(0.9);
  });
  it("medium returns 1.0", () => {
    expect(confidenceMultiplier("medium")).toBe(1.0);
  });
  it("high returns 1.2", () => {
    expect(confidenceMultiplier("high")).toBe(1.2);
  });
  it("chaos returns 1.4", () => {
    expect(confidenceMultiplier("chaos")).toBe(1.4);
  });
  it("unknown tier defaults to 1.0", () => {
    expect(confidenceMultiplier("nonexistent")).toBe(1.0);
  });
});

// ─── scoreQuestion ────────────────────────────────────────────

describe("scoreQuestion", () => {
  const results: RaceResult[] = [{
    question_id: "q-winner",
    correct_option_id: "opt-ver",
    pick_order: 1,
  }];

  const snapshot50pct: PopularitySnapshot[] = [{
    question_id: "q-winner",
    option_id: "opt-ver",
    popularity_percent: 0.5, // 50% picked Verstappen → difficulty = log2(2) = 1
  }];

  it("correct pick scores: base_points × difficulty × confidence", () => {
    const correctAnswer: PredictionAnswer[] = [{
      question_id: "q-winner",
      option_id: "opt-ver",
      pick_order: 1,
    }];

    const scored = scoreQuestion(baseQuestion, correctAnswer, results, snapshot50pct);
    // 20 × 1.0 (difficulty=log2(1/0.5)=1) × 1.0 (medium) = 20
    expect(scored.is_correct).toBe(true);
    expect(scored.raw_score).toBeCloseTo(20.0, 1);
  });

  it("wrong pick scores 0", () => {
    const wrongAnswer: PredictionAnswer[] = [{
      question_id: "q-winner",
      option_id: "opt-nor",
      pick_order: 1,
    }];

    const scored = scoreQuestion(baseQuestion, wrongAnswer, results, snapshot50pct);
    expect(scored.is_correct).toBe(false);
    expect(scored.raw_score).toBe(0);
  });

  it("rare correct pick gets higher score than common correct pick", () => {
    const answer: PredictionAnswer[] = [{
      question_id: "q-winner",
      option_id: "opt-ver",
      pick_order: 1,
    }];

    const rareSnapshot: PopularitySnapshot[] = [{
      question_id: "q-winner",
      option_id: "opt-ver",
      popularity_percent: 0.05, // 5% picked it
    }];
    const commonSnapshot: PopularitySnapshot[] = [{
      question_id: "q-winner",
      option_id: "opt-ver",
      popularity_percent: 0.8, // 80% picked it
    }];

    const rareScore   = scoreQuestion(baseQuestion, answer, results, rareSnapshot);
    const commonScore = scoreQuestion(baseQuestion, answer, results, commonSnapshot);
    expect(rareScore.raw_score).toBeGreaterThan(commonScore.raw_score);
  });

  it("no snapshot (empty) falls back to 0.5 popularity → difficulty ≈ 1.0", () => {
    // When no snapshot exists, the code defaults popularity to 0.5
    // (neutral fallback — prevents runaway scores before lock)
    // difficulty = log2(1/0.5) = log2(2) = 1.0
    const answer: PredictionAnswer[] = [{
      question_id: "q-winner",
      option_id: "opt-ver",
      pick_order: 1,
    }];

    const scored = scoreQuestion(baseQuestion, answer, results, []);
    expect(scored.difficulty_multiplier).toBeCloseTo(1.0, 5);
    expect(scored.raw_score).toBeCloseTo(20.0, 1); // 20 * 1.0 * 1.0
  });
});

// ─── scoreUserPrediction / caps ───────────────────────────────

describe("scoreUserPrediction", () => {
  it("applies edit penalty correctly", () => {
    const q: PredictionQuestion = { ...baseQuestion };
    const ans: PredictionAnswer[] = [{ question_id: "q-winner", option_id: "opt-ver", pick_order: 1 }];
    const res: RaceResult[] = [{ question_id: "q-winner", correct_option_id: "opt-ver", pick_order: 1 }];
    const snaps: PopularitySnapshot[] = [{ question_id: "q-winner", option_id: "opt-ver", popularity_percent: 0.5 }];

    const noEdit  = scoreUserPrediction("u1", "aus-2026", [q], ans, res, snaps, 0);
    const twoEdit = scoreUserPrediction("u1", "aus-2026", [q], ans, res, snaps, 2);

    expect(noEdit.edit_penalty).toBe(1.0);
    expect(twoEdit.edit_penalty).toBeCloseTo(1 / 1.16, 4);
    expect(noEdit.total_score).toBeGreaterThan(twoEdit.total_score);
  });

  it("total_score does not exceed weekend cap", () => {
    // Create a scenario where raw score would exceed 400
    const manyQuestions: PredictionQuestion[] = Array.from({ length: 10 }, (_, i) => ({
      id: `q-${i}`,
      race_id: "test",
      category: "race" as const,
      question_type: `type-${i}`,
      label: `Q${i}`,
      base_points: 300,
      confidence_tier: "chaos", // 1.4x
      multi_select: 1,
    }));

    const answers: PredictionAnswer[] = manyQuestions.map((q) => ({
      question_id: q.id,
      option_id: `opt-${q.id}`,
      pick_order: 1,
    }));
    const results: RaceResult[] = manyQuestions.map((q) => ({
      question_id: q.id,
      correct_option_id: `opt-${q.id}`,
      pick_order: 1,
    }));
    const snaps: PopularitySnapshot[] = manyQuestions.map((q) => ({
      question_id: q.id,
      option_id: `opt-${q.id}`,
      popularity_percent: 0.01, // very rare
    }));

    const result = scoreUserPrediction("u1", "test", manyQuestions, answers, results, snaps, 0);
    expect(result.total_score).toBeLessThanOrEqual(SCORE_CAPS.weekend);
  });
});

// ─── settleRace determinism ───────────────────────────────────

describe("settleRace determinism", () => {
  const questions: PredictionQuestion[] = [
    { ...baseQuestion, id: "q1" },
    { ...baseQuestion, id: "q2", category: "qualifying", question_type: "pole_sitter", base_points: 12 },
  ];

  const userPredictions = [
    {
      userId: "user-a",
      answers: [
        { question_id: "q1", option_id: "opt-ver", pick_order: 1 },
        { question_id: "q2", option_id: "opt-nor", pick_order: 1 },
      ],
      editCount: 0,
    },
    {
      userId: "user-b",
      answers: [
        { question_id: "q1", option_id: "opt-nor", pick_order: 1 },
        { question_id: "q2", option_id: "opt-ver", pick_order: 1 },
      ],
      editCount: 1,
    },
  ];

  const results: RaceResult[] = [
    { question_id: "q1", correct_option_id: "opt-ver", pick_order: 1 },
    { question_id: "q2", correct_option_id: "opt-ver", pick_order: 1 },
  ];

  const snapshots: PopularitySnapshot[] = [
    { question_id: "q1", option_id: "opt-ver", popularity_percent: 0.6 },
    { question_id: "q2", option_id: "opt-ver", popularity_percent: 0.3 },
  ];

  it("returns same output for same input (deterministic)", () => {
    const run1 = settleRace({ raceId: "aus", questions, results, snapshots, userPredictions });
    const run2 = settleRace({ raceId: "aus", questions, results, snapshots, userPredictions });
    expect(run1.scores.map((s) => s.total_score))
      .toEqual(run2.scores.map((s) => s.total_score));
  });

  it("rare correct pick can outscore a common pick despite lower base_points", () => {
    // user-a correct on q1 (race winner, 20pts, 60% popularity → difficulty=0.74)
    //   score ≈ 20 × 0.74 × 1.0 × 1.0 = 14.7
    // user-b correct on q2 (pole, 12pts, 30% popularity → difficulty=1.74)
    //   score ≈ 12 × 1.74 × 1.0 × 0.926 (1 edit) = 19.3
    // user-b wins because the rarity bonus on pole outweighs the 1-edit penalty
    const { scores } = settleRace({ raceId: "aus", questions, results, snapshots, userPredictions });
    const a = scores.find((s) => s.user_id === "user-a")!;
    const b = scores.find((s) => s.user_id === "user-b")!;
    expect(b.total_score).toBeGreaterThan(a.total_score);
  });

  it("equal rarity: higher base_points wins", () => {
    const equalSnapshots: PopularitySnapshot[] = [
      { question_id: "q1", option_id: "opt-ver", popularity_percent: 0.5 },
      { question_id: "q2", option_id: "opt-ver", popularity_percent: 0.5 },
    ];
    // user-a correct on q1 (20pts, no edits), user-b correct on q2 (12pts, 1 edit)
    const { scores } = settleRace({ raceId: "aus", questions, results, snapshots: equalSnapshots, userPredictions });
    const a = scores.find((s) => s.user_id === "user-a")!;
    const b = scores.find((s) => s.user_id === "user-b")!;
    expect(a.total_score).toBeGreaterThan(b.total_score);
  });

  it("output is sorted by total_score descending", () => {
    const { scores } = settleRace({ raceId: "aus", questions, results, snapshots, userPredictions });
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].total_score).toBeGreaterThanOrEqual(scores[i].total_score);
    }
  });

  it("scores include race_id and user_id", () => {
    const { scores } = settleRace({ raceId: "aus-test", questions, results, snapshots, userPredictions });
    expect(scores.every((s) => s.race_id === "aus-test")).toBe(true);
    expect(scores.every((s) => !!s.user_id)).toBe(true);
  });
});
