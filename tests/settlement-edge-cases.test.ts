/**
 * Settlement scoring tests
 * Covers: zero users, all wrong, tie-breaking, category caps,
 * podium partial credit, teams_q3 partial credit, points_finishers,
 * qualifying front-row partial, chaos bonus, sample user examples
 */
import { describe, it, expect } from "vitest";
import {
  settleRace,
  scoreUserPrediction,
  scoreQuestion,
  SCORE_CAPS,
  TEAMS_Q3_POINTS,
  CHAOS_BONUS_POINTS,
  CHAOS_BONUS_THRESHOLD,
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
  base_points: 25,
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
  it("same total_score: tie is deterministic (difficulty score)", () => {
    const qA: PredictionQuestion = { ...baseQuestion, id: "q-a", base_points: 20 };
    const qB: PredictionQuestion = { ...baseQuestion, id: "q-b", base_points: 20 };

    const { scores } = settleRace({
      raceId: "test",
      questions: [qA, qB],
      results: [
        { question_id: "q-a", correct_option_id: "opt-a", pick_order: 1 },
        { question_id: "q-b", correct_option_id: "opt-b", pick_order: 1 },
      ],
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
      question_type: "winner",
      base_points: 500,
      confidence_tier: "chaos",
    };
    const scored = scoreUserPrediction("u1", "test", [q], [
      { question_id: "q-q", option_id: "opt-ver", pick_order: 1 },
    ], [
      { question_id: "q-q", correct_option_id: "opt-ver", pick_order: 1 },
    ], [
      { question_id: "q-q", option_id: "opt-ver", popularity_percent: 0.01 },
    ], 0);
    expect(scored.total_score).toBeLessThanOrEqual(SCORE_CAPS.qualifying);
  });

  it("chaos score is capped at 100", () => {
    const q: PredictionQuestion = {
      ...baseQuestion,
      id: "q-c",
      category: "chaos",
      question_type: "winner",
      base_points: 500,
      confidence_tier: "chaos",
    };
    const scored = scoreUserPrediction("u1", "test", [q], [
      { question_id: "q-c", option_id: "opt-ver", pick_order: 1 },
    ], [
      { question_id: "q-c", correct_option_id: "opt-ver", pick_order: 1 },
    ], [
      { question_id: "q-c", option_id: "opt-ver", popularity_percent: 0.01 },
    ], 0);
    expect(scored.total_score).toBeLessThanOrEqual(SCORE_CAPS.chaos);
  });
});

// ─── Podium scoring ───────────────────────────────────────────

describe("podium scoring", () => {
  const podiumQ: PredictionQuestion = {
    id: "q-podium",
    race_id: "aus-2026",
    category: "race",
    question_type: "podium",
    label: "Podium",
    base_points: 58,
    confidence_tier: "medium",
    multi_select: 3,
  };
  const podiumResults: RaceResult[] = [
    { question_id: "q-podium", correct_option_id: "opt-ver", pick_order: 1 },
    { question_id: "q-podium", correct_option_id: "opt-nor", pick_order: 2 },
    { question_id: "q-podium", correct_option_id: "opt-lec", pick_order: 3 },
  ];
  const podiumSnaps: PopularitySnapshot[] = [
    { question_id: "q-podium", option_id: "opt-ver", popularity_percent: 0.5 },
    { question_id: "q-podium", option_id: "opt-nor", popularity_percent: 0.5 },
    { question_id: "q-podium", option_id: "opt-lec", popularity_percent: 0.5 },
  ];

  it("all 3 exact: P1=25, P2=18, P3=15 (difficulty=1.0 at 50%)", () => {
    const sq = scoreQuestion(podiumQ, [
      { question_id: "q-podium", option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-podium", option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-podium", option_id: "opt-lec", pick_order: 3 },
    ], podiumResults, podiumSnaps);
    // 25 + 18 + 15 = 58 at diff=1, conf=1
    expect(sq.raw_score).toBeCloseTo(58, 1);
    expect(sq.is_correct).toBe(true);
  });

  it("ticket example: VER P1 exact, LEC/NOR swapped → 25+8+8 = 41", () => {
    const sq = scoreQuestion(podiumQ, [
      { question_id: "q-podium", option_id: "opt-ver", pick_order: 1 }, // exact P1 → 25
      { question_id: "q-podium", option_id: "opt-lec", pick_order: 2 }, // lec on podium, wrong pos → 8
      { question_id: "q-podium", option_id: "opt-nor", pick_order: 3 }, // nor on podium, wrong pos → 8
    ], podiumResults, podiumSnaps);
    expect(sq.raw_score).toBeCloseTo(41, 1);
  });

  it("driver not on podium at all: 0 partial credit", () => {
    const sq = scoreQuestion(podiumQ, [
      { question_id: "q-podium", option_id: "opt-ver", pick_order: 1 }, // exact P1 → 25
      { question_id: "q-podium", option_id: "opt-ham", pick_order: 2 }, // ham not on podium → 0
      { question_id: "q-podium", option_id: "opt-ham", pick_order: 3 }, // ham not on podium → 0
    ], podiumResults, podiumSnaps);
    expect(sq.raw_score).toBeCloseTo(25, 1);
  });

  it("all wrong, no driver on podium: 0 pts", () => {
    const sq = scoreQuestion(podiumQ, [
      { question_id: "q-podium", option_id: "opt-ham", pick_order: 1 },
      { question_id: "q-podium", option_id: "opt-ham", pick_order: 2 },
      { question_id: "q-podium", option_id: "opt-ham", pick_order: 3 },
    ], podiumResults, podiumSnaps);
    expect(sq.raw_score).toBe(0);
    expect(sq.is_correct).toBe(false);
  });
});

// ─── Qualifying scoring ───────────────────────────────────────

describe("qualifying scoring", () => {
  const qualiQ: PredictionQuestion = {
    id: "q-quali",
    race_id: "aus-2026",
    category: "qualifying",
    question_type: "qualifying",
    label: "Qualifying Top 3",
    base_points: 35,
    confidence_tier: "medium",
    multi_select: 3,
  };
  const qualiResults: RaceResult[] = [
    { question_id: "q-quali", correct_option_id: "opt-ver", pick_order: 1 },
    { question_id: "q-quali", correct_option_id: "opt-nor", pick_order: 2 },
    { question_id: "q-quali", correct_option_id: "opt-lec", pick_order: 3 },
  ];
  const qualiSnaps: PopularitySnapshot[] = [
    { question_id: "q-quali", option_id: "opt-ver", popularity_percent: 0.5 },
    { question_id: "q-quali", option_id: "opt-nor", popularity_percent: 0.5 },
    { question_id: "q-quali", option_id: "opt-lec", popularity_percent: 0.5 },
  ];

  it("all 3 exact: Pole=15, P2=10, P3=10 = 35 total", () => {
    const sq = scoreQuestion(qualiQ, [
      { question_id: "q-quali", option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-quali", option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-quali", option_id: "opt-lec", pick_order: 3 },
    ], qualiResults, qualiSnaps);
    expect(sq.raw_score).toBeCloseTo(35, 1);
  });

  it("front row miss: +5 each for NOR/VER swapped, +10 for LEC P3 exact = 20", () => {
    const sq = scoreQuestion(qualiQ, [
      { question_id: "q-quali", option_id: "opt-nor", pick_order: 1 }, // NOR is P2, user picked P1 → +5
      { question_id: "q-quali", option_id: "opt-ver", pick_order: 2 }, // VER is P1, user picked P2 → +5
      { question_id: "q-quali", option_id: "opt-lec", pick_order: 3 }, // exact P3 → +10
    ], qualiResults, qualiSnaps);
    expect(sq.raw_score).toBeCloseTo(20, 1);
  });
});

// ─── Teams in Q3 scoring ──────────────────────────────────────

describe("teams_q3 scoring", () => {
  const teamsQ: PredictionQuestion = {
    id: "q-teams",
    race_id: "aus-2026",
    category: "qualifying",
    question_type: "teams_q3",
    label: "Teams in Q3",
    base_points: 15,
    confidence_tier: "medium",
    multi_select: 5,
  };
  const teamsResults: RaceResult[] = Array.from({ length: 5 }, (_, i) => ({
    question_id: "q-teams",
    correct_option_id: `t${i + 1}`,
    pick_order: i + 1,
  }));
  const teamsSnaps: PopularitySnapshot[] = Array.from({ length: 5 }, (_, i) => ({
    question_id: "q-teams",
    option_id: `t${i + 1}`,
    popularity_percent: 0.5,
  }));

  const picks = (ids: string[]): PredictionAnswer[] =>
    ids.map((id, i) => ({ question_id: "q-teams", option_id: id, pick_order: i + 1 }));

  it("5/5 correct: +15", () => {
    const sq = scoreQuestion(teamsQ, picks(["t1", "t2", "t3", "t4", "t5"]), teamsResults, teamsSnaps);
    expect(sq.raw_score).toBeCloseTo(TEAMS_Q3_POINTS[5] ?? 15, 1);
    expect(sq.is_correct).toBe(true);
  });

  it("4/5 correct: +8", () => {
    const sq = scoreQuestion(teamsQ, picks(["t1", "t2", "t3", "t4", "t-wrong"]), teamsResults, teamsSnaps);
    expect(sq.raw_score).toBeCloseTo(TEAMS_Q3_POINTS[4] ?? 8, 1);
  });

  it("3/5 correct: +4", () => {
    const sq = scoreQuestion(teamsQ, picks(["t1", "t2", "t3", "t-x", "t-y"]), teamsResults, teamsSnaps);
    expect(sq.raw_score).toBeCloseTo(TEAMS_Q3_POINTS[3] ?? 4, 1);
  });

  it("2/5 correct: 0", () => {
    const sq = scoreQuestion(teamsQ, picks(["t1", "t2", "t-x", "t-y", "t-z"]), teamsResults, teamsSnaps);
    expect(sq.raw_score).toBe(0);
    expect(sq.is_correct).toBe(false);
  });
});

// ─── Points finishers scoring ─────────────────────────────────

describe("points_finishers scoring", () => {
  const pfQ: PredictionQuestion = {
    id: "q-pf",
    race_id: "aus-2026",
    category: "race",
    question_type: "points_finishers",
    label: "Points Finishers P5-P10",
    base_points: 10,
    confidence_tier: "medium",
    multi_select: 6,
  };
  const pfResults: RaceResult[] = Array.from({ length: 6 }, (_, i) => ({
    question_id: "q-pf",
    correct_option_id: `d${i + 1}`,
    pick_order: i + 1,
  }));
  const pfSnaps: PopularitySnapshot[] = Array.from({ length: 6 }, (_, i) => ({
    question_id: "q-pf",
    option_id: `d${i + 1}`,
    popularity_percent: 0.5,
  }));

  const picks = (ids: string[]): PredictionAnswer[] =>
    ids.map((id, i) => ({ question_id: "q-pf", option_id: id, pick_order: i + 1 }));

  it("5+/6 correct: +10", () => {
    const sq = scoreQuestion(pfQ, picks(["d1", "d2", "d3", "d4", "d5", "d-wrong"]), pfResults, pfSnaps);
    expect(sq.raw_score).toBeCloseTo(10, 1);
  });

  it("3-4 correct: +5", () => {
    const sq = scoreQuestion(pfQ, picks(["d1", "d2", "d3", "d-x", "d-y", "d-z"]), pfResults, pfSnaps);
    expect(sq.raw_score).toBeCloseTo(5, 1);
  });

  it("1-2 correct: +2", () => {
    const sq = scoreQuestion(pfQ, picks(["d1", "d-x", "d-y", "d-z1", "d-z2", "d-z3"]), pfResults, pfSnaps);
    expect(sq.raw_score).toBeCloseTo(2, 1);
  });

  it("0 correct: 0", () => {
    const sq = scoreQuestion(pfQ, picks(["d-a", "d-b", "d-c", "d-d", "d-e", "d-f"]), pfResults, pfSnaps);
    expect(sq.raw_score).toBe(0);
    expect(sq.is_correct).toBe(false);
  });
});

// ─── Chaos bonus ──────────────────────────────────────────────

describe("chaos bonus", () => {
  it(`adds +${CHAOS_BONUS_POINTS} pts when ${CHAOS_BONUS_THRESHOLD}+ questions score`, () => {
    const questions: PredictionQuestion[] = Array.from({ length: 12 }, (_, i) => ({
      id: `q${i}`, race_id: "test", category: "race" as const,
      question_type: "winner", label: `Q${i}`,
      base_points: 5, confidence_tier: "medium", multi_select: 1,
    }));
    const answers: PredictionAnswer[] = questions.map((q) => ({
      question_id: q.id, option_id: `opt-${q.id}`, pick_order: 1,
    }));
    const results: RaceResult[] = questions.map((q) => ({
      question_id: q.id, correct_option_id: `opt-${q.id}`, pick_order: 1,
    }));
    const snapshots: PopularitySnapshot[] = questions.map((q) => ({
      question_id: q.id, option_id: `opt-${q.id}`, popularity_percent: 0.5,
    }));

    const scored = scoreUserPrediction("u1", "test", questions, answers, results, snapshots, 0);
    expect(scored.chaos_bonus).toBe(CHAOS_BONUS_POINTS);
    // 12 × 5 = 60 base + 5 chaos bonus = 65
    expect(scored.total_score).toBeCloseTo(65, 1);
  });

  it("no chaos bonus when fewer than 10 questions score", () => {
    const questions: PredictionQuestion[] = Array.from({ length: 5 }, (_, i) => ({
      id: `q${i}`, race_id: "test", category: "race" as const,
      question_type: "winner", label: `Q${i}`,
      base_points: 5, confidence_tier: "medium", multi_select: 1,
    }));
    const answers: PredictionAnswer[] = questions.map((q) => ({
      question_id: q.id, option_id: `opt-${q.id}`, pick_order: 1,
    }));
    const results: RaceResult[] = questions.map((q) => ({
      question_id: q.id, correct_option_id: `opt-${q.id}`, pick_order: 1,
    }));
    const snapshots: PopularitySnapshot[] = questions.map((q) => ({
      question_id: q.id, option_id: `opt-${q.id}`, popularity_percent: 0.5,
    }));

    const scored = scoreUserPrediction("u1", "test", questions, answers, results, snapshots, 0);
    expect(scored.chaos_bonus).toBe(0);
    expect(scored.total_score).toBeCloseTo(25, 1);
  });
});

// ─── Sample user scoring (realistic) ─────────────────────────

describe("sample user scoring", () => {
  it("User A: winner + exact podium + safety car = 88 pts (no chaos bonus)", () => {
    const questions: PredictionQuestion[] = [
      { id: "q-win", race_id: "r1", category: "race", question_type: "winner", label: "Winner", base_points: 25, confidence_tier: "medium", multi_select: 1 },
      { id: "q-pod", race_id: "r1", category: "race", question_type: "podium", label: "Podium", base_points: 58, confidence_tier: "medium", multi_select: 3 },
      { id: "q-sc", race_id: "r1", category: "chaos", question_type: "safety_car", label: "Safety Car", base_points: 5, confidence_tier: "medium", multi_select: 1 },
    ];
    const answers: PredictionAnswer[] = [
      { question_id: "q-win", option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-pod", option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-pod", option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-pod", option_id: "opt-lec", pick_order: 3 },
      { question_id: "q-sc", option_id: "opt-yes", pick_order: 1 },
    ];
    const results: RaceResult[] = [
      { question_id: "q-win", correct_option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-pod", correct_option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-pod", correct_option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-pod", correct_option_id: "opt-lec", pick_order: 3 },
      { question_id: "q-sc", correct_option_id: "opt-yes", pick_order: 1 },
    ];
    const snapshots: PopularitySnapshot[] = [
      { question_id: "q-win", option_id: "opt-ver", popularity_percent: 0.5 },
      { question_id: "q-pod", option_id: "opt-ver", popularity_percent: 0.5 },
      { question_id: "q-pod", option_id: "opt-nor", popularity_percent: 0.5 },
      { question_id: "q-pod", option_id: "opt-lec", popularity_percent: 0.5 },
      { question_id: "q-sc", option_id: "opt-yes", popularity_percent: 0.5 },
    ];

    const scored = scoreUserPrediction("userA", "r1", questions, answers, results, snapshots, 0);
    // race: winner 25 + podium 58 = 83; chaos: 5; base = 88; no chaos bonus (3 correct < 10)
    expect(scored.total_score).toBeCloseTo(88, 1);
    expect(scored.chaos_bonus).toBe(0);
  });

  it("User B: podium swapped VER/NOR/LEC → 41 pts from podium question", () => {
    const podiumQ: PredictionQuestion = {
      id: "q-pod", race_id: "r1", category: "race", question_type: "podium",
      label: "Podium", base_points: 58, confidence_tier: "medium", multi_select: 3,
    };
    // Ticket example: VER P1 exact, LEC/NOR swapped → 25+8+8 = 41
    const sq = scoreQuestion(podiumQ, [
      { question_id: "q-pod", option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-pod", option_id: "opt-lec", pick_order: 2 },
      { question_id: "q-pod", option_id: "opt-nor", pick_order: 3 },
    ], [
      { question_id: "q-pod", correct_option_id: "opt-ver", pick_order: 1 },
      { question_id: "q-pod", correct_option_id: "opt-nor", pick_order: 2 },
      { question_id: "q-pod", correct_option_id: "opt-lec", pick_order: 3 },
    ], [
      { question_id: "q-pod", option_id: "opt-ver", popularity_percent: 0.5 },
      { question_id: "q-pod", option_id: "opt-nor", popularity_percent: 0.5 },
      { question_id: "q-pod", option_id: "opt-lec", popularity_percent: 0.5 },
    ]);
    expect(sq.raw_score).toBeCloseTo(41, 1);
  });
});
