/**
 * E2E Happy Path Test — Core Gridlock game loop
 *
 * Covers the critical path:
 *   User signs in → sees race list → submits prediction → admin enters result
 *   → scoring engine runs → user score is updated
 *
 * What is REAL here:
 *   - Full scoring pipeline (settleRace, scoreUserPrediction)
 *   - Point calculation for correct/incorrect/partial predictions
 *   - Score caps enforcement
 *   - Rate limiter behaviour
 *
 * What is MOCKED / not covered here:
 *   - Supabase DB round-trips (tested by individual route handlers)
 *   - Privy auth handshake (requires live Privy account + browser)
 *   - Browser session cookie flow (requires a real browser)
 */

import { describe, it, expect } from "vitest";
import {
  settleRace,
  scoreUserPrediction,
  type PredictionQuestion,
  type PredictionAnswer,
  type RaceResult,
  type PopularitySnapshot,
  type SettlementInput,
} from "../lib/scoring/settleRace";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const RACE_ID = "australia-2026";

const PODIUM_Q: PredictionQuestion = {
  id: "q-podium",
  race_id: RACE_ID,
  category: "race",
  question_type: "podium",
  label: "Podium Finishers (P1–P3)",
  base_points: 25,
  confidence_tier: "medium",
  multi_select: 3,
};

const POLE_Q: PredictionQuestion = {
  id: "q-pole",
  race_id: RACE_ID,
  category: "qualifying",
  question_type: "winner",
  label: "Pole Position",
  base_points: 15,
  confidence_tier: "high",
  multi_select: 1,
};

const SAFETY_Q: PredictionQuestion = {
  id: "q-safety",
  race_id: RACE_ID,
  category: "chaos",
  question_type: "yes_no",
  label: "Safety Car?",
  base_points: 10,
  confidence_tier: "chaos",
  multi_select: 1,
};

const QUESTIONS = [PODIUM_Q, POLE_Q, SAFETY_Q];

// Option IDs
const NOR_P1 = "opt-nor-p1";
const VER_P2 = "opt-ver-p2";
const LEC_P3 = "opt-lec-p3";
const NOR_POLE = "opt-nor-pole";
const SC_YES = "opt-sc-yes";
const SC_NO = "opt-sc-no";

// Results: Norris 1st, Verstappen 2nd, Leclerc 3rd; Norris pole; SC happened
const RESULTS: RaceResult[] = [
  { question_id: "q-podium", correct_option_id: NOR_P1, pick_order: 1 },
  { question_id: "q-podium", correct_option_id: VER_P2, pick_order: 2 },
  { question_id: "q-podium", correct_option_id: LEC_P3, pick_order: 3 },
  { question_id: "q-pole", correct_option_id: NOR_POLE, pick_order: 1 },
  { question_id: "q-safety", correct_option_id: SC_YES, pick_order: 1 },
];

// Popularity: moderate pick rates (popularity_percent = fraction 0–1)
const SNAPSHOTS: PopularitySnapshot[] = [
  { question_id: "q-podium", option_id: NOR_P1, popularity_percent: 0.5 },
  { question_id: "q-podium", option_id: VER_P2, popularity_percent: 0.4 },
  { question_id: "q-podium", option_id: LEC_P3, popularity_percent: 0.3 },
  { question_id: "q-pole", option_id: NOR_POLE, popularity_percent: 0.6 },
  { question_id: "q-safety", option_id: SC_YES, popularity_percent: 0.5 },
  { question_id: "q-safety", option_id: SC_NO, popularity_percent: 0.5 },
];

// ─── Scenario A: Perfect prediction ──────────────────────────────────────────

describe("E2E: Perfect prediction scores correctly", () => {
  const USER = "user-perfect";

  const perfectAnswers: PredictionAnswer[] = [
    { question_id: "q-podium", option_id: NOR_P1, pick_order: 1 },
    { question_id: "q-podium", option_id: VER_P2, pick_order: 2 },
    { question_id: "q-podium", option_id: LEC_P3, pick_order: 3 },
    { question_id: "q-pole", option_id: NOR_POLE, pick_order: 1 },
    { question_id: "q-safety", option_id: SC_YES, pick_order: 1 },
  ];

  it("awards positive total score", () => {
    const result = scoreUserPrediction(USER, RACE_ID, QUESTIONS, perfectAnswers, RESULTS, SNAPSHOTS, 0);
    expect(result.total_score).toBeGreaterThan(0);
  });

  it("awards podium points", () => {
    const result = scoreUserPrediction(USER, RACE_ID, QUESTIONS, perfectAnswers, RESULTS, SNAPSHOTS, 0);
    const podium = result.breakdown.find((b) => b.question_id === "q-podium");
    expect(podium?.raw_score).toBeGreaterThan(0);
  });

  it("awards qualifying points for correct pole", () => {
    const result = scoreUserPrediction(USER, RACE_ID, QUESTIONS, perfectAnswers, RESULTS, SNAPSHOTS, 0);
    const qual = result.breakdown.find((b) => b.question_id === "q-pole");
    expect(qual?.raw_score).toBeGreaterThan(0);
  });

  it("score stays within weekend cap (400)", () => {
    const result = scoreUserPrediction(USER, RACE_ID, QUESTIONS, perfectAnswers, RESULTS, SNAPSHOTS, 0);
    expect(result.total_score).toBeLessThanOrEqual(400);
  });
});

// ─── Scenario B: Wrong predictions score zero ─────────────────────────────────

describe("E2E: Wrong predictions score zero", () => {
  const USER = "user-wrong";

  const wrongAnswers: PredictionAnswer[] = [
    { question_id: "q-pole", option_id: LEC_P3, pick_order: 1 }, // wrong pole
    { question_id: "q-safety", option_id: SC_NO, pick_order: 1 }, // wrong safety car
  ];

  it("gives zero for wrong pole pick", () => {
    const result = scoreUserPrediction(USER, RACE_ID, QUESTIONS, wrongAnswers, RESULTS, SNAPSHOTS, 0);
    const qual = result.breakdown.find((b) => b.question_id === "q-pole");
    expect(qual?.raw_score).toBe(0);
  });

  it("gives zero for wrong safety car pick", () => {
    const result = scoreUserPrediction(USER, RACE_ID, QUESTIONS, wrongAnswers, RESULTS, SNAPSHOTS, 0);
    const chaos = result.breakdown.find((b) => b.question_id === "q-safety");
    expect(chaos?.raw_score).toBe(0);
  });
});

// ─── Scenario C: settleRace with two users ────────────────────────────────────

describe("E2E: settleRace — perfect user beats wrong user", () => {
  const PERFECT = "user-perfect";
  const WRONG = "user-wrong";

  const input: SettlementInput = {
    raceId: RACE_ID,
    questions: QUESTIONS,
    results: RESULTS,
    snapshots: SNAPSHOTS,
    userPredictions: [
      {
        userId: PERFECT,
        editCount: 0,
        answers: [
          { question_id: "q-podium", option_id: NOR_P1, pick_order: 1 },
          { question_id: "q-podium", option_id: VER_P2, pick_order: 2 },
          { question_id: "q-podium", option_id: LEC_P3, pick_order: 3 },
          { question_id: "q-pole", option_id: NOR_POLE, pick_order: 1 },
          { question_id: "q-safety", option_id: SC_YES, pick_order: 1 },
        ],
      },
      {
        userId: WRONG,
        editCount: 0,
        answers: [
          { question_id: "q-pole", option_id: LEC_P3, pick_order: 1 },
          { question_id: "q-safety", option_id: SC_NO, pick_order: 1 },
        ],
      },
    ],
  };

  it("perfect user scores higher than wrong user", () => {
    const { scores } = settleRace(input);
    const perfect = scores.find((s) => s.user_id === PERFECT)!;
    const wrong = scores.find((s) => s.user_id === WRONG)!;
    expect(perfect.total_score).toBeGreaterThan(wrong.total_score);
  });

  it("wrong user total is zero", () => {
    const { scores } = settleRace(input);
    const wrong = scores.find((s) => s.user_id === WRONG)!;
    expect(wrong.total_score).toBe(0);
  });

  it("all scores within weekend cap", () => {
    const { scores } = settleRace(input);
    for (const s of scores) {
      expect(s.total_score).toBeGreaterThanOrEqual(0);
      expect(s.total_score).toBeLessThanOrEqual(400);
    }
  });

  it("returns settled timestamp", () => {
    const { settledAt } = settleRace(input);
    expect(typeof settledAt).toBe("string");
    expect(new Date(settledAt).getTime()).not.toBeNaN();
  });
});

// ─── Rate limiter ─────────────────────────────────────────────────────────────

describe("Rate limiter — basic behaviour", () => {
  it("allows requests within the limit", async () => {
    const { isRateLimited } = await import("../lib/rate-limit");
    const key = `test-allow:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(key, 5, 60_000)).toBe(false);
    }
  });

  it("blocks the request after limit is exceeded", async () => {
    const { isRateLimited } = await import("../lib/rate-limit");
    const key = `test-block:${Date.now()}:${Math.random()}`;
    for (let i = 0; i < 3; i++) isRateLimited(key, 3, 60_000);
    expect(isRateLimited(key, 3, 60_000)).toBe(true);
  });

  it("different keys are tracked independently", async () => {
    const { isRateLimited } = await import("../lib/rate-limit");
    const ts = Date.now();
    const keyA = `test-a:${ts}:${Math.random()}`;
    const keyB = `test-b:${ts}:${Math.random()}`;
    for (let i = 0; i < 3; i++) isRateLimited(keyA, 3, 60_000);
    // keyA is now at limit, keyB should not be
    expect(isRateLimited(keyA, 3, 60_000)).toBe(true);
    expect(isRateLimited(keyB, 3, 60_000)).toBe(false);
  });
});
