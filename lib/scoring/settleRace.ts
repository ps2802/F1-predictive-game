/**
 * F1 PREDICTION PLATFORM — SCORING ENGINE
 *
 * Deterministic, replayable scoring pipeline.
 * Score = BasePoints × DifficultyMultiplier × ConfidenceMultiplier × EditPenalty
 *
 * Anti-herd: Difficulty = log2(1 / pickPopularity)
 * Edit penalty: 1 / (1 + edits × 0.08)
 * Score caps: Qualifying 150, Race 300, Weekend 400
 *
 * Question-type-specific scoring:
 * - podium: P1=25, P2=18, P3=15 exact; +8 partial for driver on podium wrong position
 * - qualifying: Pole=15, P2/P3=10 exact; +5 for driver on front row (P1/P2) wrong position
 * - teams_q3: 5/5=15, 4/5=8, 3/5=4 (set membership, not positional)
 * - points_finishers: 5+/6=10, 3-4/6=5, 1-2/6=2 (set membership)
 * - all others: base_points from DB × difficulty × confidence
 * Chaos Bonus: +5 if ≥10 questions score any points in the race
 */

export const SCORE_CAPS = {
  qualifying: 150,
  race: 300,
  chaos: 100,
  weekend: 400,
} as const;

export const CONFIDENCE_MULTIPLIERS: Record<string, number> = {
  low_variance: 0.9,
  medium: 1.0,
  high: 1.2,
  chaos: 1.4,
};

export const MAX_DIFFICULTY_MULTIPLIER = 6.5;

// Points for exact-match podium positions
export const PODIUM_EXACT_POINTS = [25, 18, 15] as const; // P1, P2, P3
export const PODIUM_PARTIAL_CREDIT = 8; // driver on podium, wrong position

// Points for exact-match qualifying positions
export const QUALIFYING_EXACT_POINTS = [15, 10, 10] as const; // Pole, Q2, Q3
export const QUALIFYING_FRONT_ROW_PARTIAL = 5; // driver on front row (P1/P2), wrong position

// Teams in Q3 tier points (by correct count)
export const TEAMS_Q3_POINTS: Record<number, number> = { 5: 15, 4: 8, 3: 4 };

// Points finishers tier (by minimum correct count)
export const POINTS_FINISHERS_TIERS = [
  { min: 5, pts: 10 },
  { min: 3, pts: 5 },
  { min: 1, pts: 2 },
] as const;

// Chaos bonus threshold and value
export const CHAOS_BONUS_THRESHOLD = 10;
export const CHAOS_BONUS_POINTS = 5;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type QuestionCategory = "qualifying" | "race" | "chaos";

export type PredictionQuestion = {
  id: string;
  race_id: string;
  category: QuestionCategory;
  question_type: string;
  label: string;
  base_points: number;
  confidence_tier: string;
  multi_select: number;
};

export type PredictionAnswer = {
  question_id: string;
  option_id: string;
  pick_order: number;
};

export type RaceResult = {
  question_id: string;
  correct_option_id: string;
  pick_order: number;
};

export type PopularitySnapshot = {
  question_id: string;
  option_id: string;
  popularity_percent: number; // 0–1 (e.g. 0.42 for 42%)
};

export type ScoredQuestion = {
  question_id: string;
  question_type: string;
  category: QuestionCategory;
  base_points: number;
  difficulty_multiplier: number;
  confidence_multiplier: number;
  raw_score: number;
  is_correct: boolean;
  correct_picks: number;
};

export type RaceScoreResult = {
  user_id: string;
  race_id: string;
  total_score: number;
  base_score: number;
  difficulty_score: number;
  edit_penalty: number;
  chaos_bonus: number;
  correct_picks: number;
  submitted_at: string | null;
  breakdown: ScoredQuestion[];
};

// ─────────────────────────────────────────────────────────────
// Core formula functions
// ─────────────────────────────────────────────────────────────

/**
 * Difficulty multiplier from pick popularity.
 * difficulty = log2(1 / popularity)
 * Capped at MAX_DIFFICULTY_MULTIPLIER.
 */
export function difficultyMultiplier(popularityPercent: number): number {
  if (popularityPercent <= 0) return MAX_DIFFICULTY_MULTIPLIER;
  const raw = Math.log2(1 / popularityPercent);
  return Math.min(raw, MAX_DIFFICULTY_MULTIPLIER);
}

/**
 * Edit penalty multiplier.
 * penalty = 1 / (1 + edits × 0.08)
 */
export function editPenalty(editCount: number): number {
  return 1 / (1 + editCount * 0.08);
}

/**
 * Confidence multiplier from tier name.
 */
export function confidenceMultiplier(tier: string): number {
  return CONFIDENCE_MULTIPLIERS[tier] ?? 1.0;
}

// ─────────────────────────────────────────────────────────────
// Partial helpers
// ─────────────────────────────────────────────────────────────

function getPopularity(snapshots: PopularitySnapshot[], optionId: string): number {
  return snapshots.find((s) => s.option_id === optionId)?.popularity_percent ?? 0.5;
}

function avgDifficultyForOptions(
  snapshots: PopularitySnapshot[],
  optionIds: string[]
): number {
  if (optionIds.length === 0) return 1.0;
  const total = optionIds.reduce(
    (sum, id) => sum + difficultyMultiplier(getPopularity(snapshots, id)),
    0
  );
  return total / optionIds.length;
}

// ─────────────────────────────────────────────────────────────
// Specialized scoring functions
// ─────────────────────────────────────────────────────────────

/**
 * Podium (P1/P2/P3 race):
 *   Exact position match → position-specific points (25 / 18 / 15)
 *   Driver on podium, wrong position → +8 partial
 */
function scorePodium(
  question: PredictionQuestion,
  userAnswers: PredictionAnswer[],
  results: RaceResult[],
  snapshots: PopularitySnapshot[]
): ScoredQuestion {
  const confMult = confidenceMultiplier(question.confidence_tier);
  const correctOptionIds = new Set(results.map((r) => r.correct_option_id));

  let rawScore = 0;
  let totalDiff = 0;
  let scoringCount = 0;

  for (const answer of userAnswers) {
    const exactResult = results.find(
      (r) => r.correct_option_id === answer.option_id && r.pick_order === answer.pick_order
    );
    const diff = difficultyMultiplier(getPopularity(snapshots, answer.option_id));

    if (exactResult) {
      const pts = PODIUM_EXACT_POINTS[answer.pick_order - 1] ?? question.base_points;
      rawScore += pts * diff * confMult;
      totalDiff += diff;
      scoringCount++;
    } else if (correctOptionIds.has(answer.option_id)) {
      // Driver is on podium but at wrong position
      rawScore += PODIUM_PARTIAL_CREDIT * diff * confMult;
      totalDiff += diff;
      scoringCount++;
    }
  }

  const avgDiff = scoringCount > 0 ? totalDiff / scoringCount : 1.0;

  return {
    question_id: question.id,
    question_type: question.question_type,
    category: question.category,
    base_points: question.base_points,
    difficulty_multiplier: avgDiff,
    confidence_multiplier: confMult,
    raw_score: rawScore,
    is_correct: scoringCount > 0,
    correct_picks: scoringCount,
  };
}

/**
 * Qualifying (P1/P2/P3 grid):
 *   Exact position match → position-specific points (15 / 10 / 10)
 *   Driver on front row (P1 or P2 in results), wrong position → +5 partial
 */
function scoreQualifying(
  question: PredictionQuestion,
  userAnswers: PredictionAnswer[],
  results: RaceResult[],
  snapshots: PopularitySnapshot[]
): ScoredQuestion {
  const confMult = confidenceMultiplier(question.confidence_tier);
  // Front row = pick_order 1 or 2 in qualifying results
  const frontRowOptionIds = new Set(
    results.filter((r) => r.pick_order <= 2).map((r) => r.correct_option_id)
  );

  let rawScore = 0;
  let totalDiff = 0;
  let scoringCount = 0;

  for (const answer of userAnswers) {
    const exactResult = results.find(
      (r) => r.correct_option_id === answer.option_id && r.pick_order === answer.pick_order
    );
    const diff = difficultyMultiplier(getPopularity(snapshots, answer.option_id));

    if (exactResult) {
      const pts = QUALIFYING_EXACT_POINTS[answer.pick_order - 1] ?? question.base_points;
      rawScore += pts * diff * confMult;
      totalDiff += diff;
      scoringCount++;
    } else if (frontRowOptionIds.has(answer.option_id)) {
      // Driver is on the front row but the user predicted a different position
      rawScore += QUALIFYING_FRONT_ROW_PARTIAL * diff * confMult;
      totalDiff += diff;
      scoringCount++;
    }
  }

  const avgDiff = scoringCount > 0 ? totalDiff / scoringCount : 1.0;

  return {
    question_id: question.id,
    question_type: question.question_type,
    category: question.category,
    base_points: question.base_points,
    difficulty_multiplier: avgDiff,
    confidence_multiplier: confMult,
    raw_score: rawScore,
    is_correct: scoringCount > 0,
    correct_picks: scoringCount,
  };
}

/**
 * Teams in Q3 (pick 5 teams):
 *   5/5 correct → +15, 4/5 → +8, 3/5 → +4  (set membership, not positional)
 *   Difficulty applied to the tier base points.
 */
function scoreTeamsQ3(
  question: PredictionQuestion,
  userAnswers: PredictionAnswer[],
  results: RaceResult[],
  snapshots: PopularitySnapshot[]
): ScoredQuestion {
  const confMult = confidenceMultiplier(question.confidence_tier);
  const correctOptionIds = new Set(results.map((r) => r.correct_option_id));

  const correctPicks = userAnswers.filter((a) => correctOptionIds.has(a.option_id));
  const correctCount = correctPicks.length;
  const basePts = TEAMS_Q3_POINTS[correctCount] ?? 0;

  if (basePts === 0) {
    return {
      question_id: question.id,
      question_type: question.question_type,
      category: question.category,
      base_points: question.base_points,
      difficulty_multiplier: 1.0,
      confidence_multiplier: confMult,
      raw_score: 0,
      is_correct: false,
      correct_picks: 0,
    };
  }

  const avgDiff = avgDifficultyForOptions(snapshots, correctPicks.map((a) => a.option_id));
  const rawScore = basePts * avgDiff * confMult;

  return {
    question_id: question.id,
    question_type: question.question_type,
    category: question.category,
    base_points: question.base_points,
    difficulty_multiplier: avgDiff,
    confidence_multiplier: confMult,
    raw_score: rawScore,
    is_correct: true,
    correct_picks: correctCount,
  };
}

/**
 * Points finishers P5–P10 (pick 6 drivers):
 *   5+/6 correct → +10, 3–4 → +5, 1–2 → +2  (set membership, not positional)
 */
function scorePointsFinishers(
  question: PredictionQuestion,
  userAnswers: PredictionAnswer[],
  results: RaceResult[],
  snapshots: PopularitySnapshot[]
): ScoredQuestion {
  const confMult = confidenceMultiplier(question.confidence_tier);
  const correctOptionIds = new Set(results.map((r) => r.correct_option_id));

  const correctPicks = userAnswers.filter((a) => correctOptionIds.has(a.option_id));
  const correctCount = correctPicks.length;

  let basePts = 0;
  for (const tier of POINTS_FINISHERS_TIERS) {
    if (correctCount >= tier.min) {
      basePts = tier.pts;
      break;
    }
  }

  if (basePts === 0) {
    return {
      question_id: question.id,
      question_type: question.question_type,
      category: question.category,
      base_points: question.base_points,
      difficulty_multiplier: 1.0,
      confidence_multiplier: confMult,
      raw_score: 0,
      is_correct: false,
      correct_picks: 0,
    };
  }

  const avgDiff = avgDifficultyForOptions(snapshots, correctPicks.map((a) => a.option_id));
  const rawScore = basePts * avgDiff * confMult;

  return {
    question_id: question.id,
    question_type: question.question_type,
    category: question.category,
    base_points: question.base_points,
    difficulty_multiplier: avgDiff,
    confidence_multiplier: confMult,
    raw_score: rawScore,
    is_correct: true,
    correct_picks: correctCount,
  };
}

// ─────────────────────────────────────────────────────────────
// Score a single question answer
// ─────────────────────────────────────────────────────────────

export function scoreQuestion(
  question: PredictionQuestion,
  userAnswers: PredictionAnswer[],
  results: RaceResult[],
  snapshots: PopularitySnapshot[]
): ScoredQuestion {
  const questionAnswers = userAnswers.filter((a) => a.question_id === question.id);
  const questionResults = results.filter((r) => r.question_id === question.id);
  const questionSnapshots = snapshots.filter((s) => s.question_id === question.id);

  // Dispatch to specialized scorers for question types with partial credit
  if (question.question_type === "podium") {
    return scorePodium(question, questionAnswers, questionResults, questionSnapshots);
  }
  if (question.question_type === "qualifying") {
    return scoreQualifying(question, questionAnswers, questionResults, questionSnapshots);
  }
  if (question.question_type === "teams_q3") {
    return scoreTeamsQ3(question, questionAnswers, questionResults, questionSnapshots);
  }
  if (question.question_type === "points_finishers") {
    return scorePointsFinishers(question, questionAnswers, questionResults, questionSnapshots);
  }

  // ── Default: exact match scoring (winner, fastest_lap, safety_car, h2h, etc.) ──
  const confMult = confidenceMultiplier(question.confidence_tier);

  let correctPicks = 0;
  let totalDifficulty = 0;

  for (const answer of questionAnswers) {
    const isCorrect = questionResults.some(
      (r) =>
        r.correct_option_id === answer.option_id &&
        r.pick_order === answer.pick_order
    );

    if (isCorrect) {
      correctPicks++;
      const popularity = getPopularity(questionSnapshots, answer.option_id);
      totalDifficulty += difficultyMultiplier(popularity);
    }
  }

  const isCorrect = correctPicks > 0;
  const avgDifficulty = correctPicks > 0 ? totalDifficulty / correctPicks : 1.0;

  // Points per correct pick (split base_points across multi_select)
  const pointsPerPick =
    question.multi_select > 1
      ? question.base_points / question.multi_select
      : question.base_points;

  const rawScore = isCorrect
    ? correctPicks * pointsPerPick * avgDifficulty * confMult
    : 0;

  return {
    question_id: question.id,
    question_type: question.question_type,
    category: question.category,
    base_points: question.base_points,
    difficulty_multiplier: avgDifficulty,
    confidence_multiplier: confMult,
    raw_score: rawScore,
    is_correct: isCorrect,
    correct_picks: correctPicks,
  };
}

// ─────────────────────────────────────────────────────────────
// Score all questions for a user
// ─────────────────────────────────────────────────────────────

export function scoreUserPrediction(
  userId: string,
  raceId: string,
  questions: PredictionQuestion[],
  userAnswers: PredictionAnswer[],
  results: RaceResult[],
  snapshots: PopularitySnapshot[],
  editCount: number,
  submittedAt?: string | null
): RaceScoreResult {
  const breakdown: ScoredQuestion[] = questions.map((q) =>
    scoreQuestion(q, userAnswers, results, snapshots)
  );

  // Sum raw scores by category, apply caps
  let qualifyingRaw = 0;
  let raceRaw = 0;
  let chaosRaw = 0;

  for (const sq of breakdown) {
    if (sq.category === "qualifying") qualifyingRaw += sq.raw_score;
    else if (sq.category === "race") raceRaw += sq.raw_score;
    else chaosRaw += sq.raw_score;
  }

  const qualifyingScore = Math.min(qualifyingRaw, SCORE_CAPS.qualifying);
  const raceScore = Math.min(raceRaw, SCORE_CAPS.race);
  const chaosScore = Math.min(chaosRaw, SCORE_CAPS.chaos);

  const baseScore = qualifyingScore + raceScore + chaosScore;
  const difficultyScore = breakdown.reduce(
    (acc, sq) => acc + sq.raw_score * (sq.difficulty_multiplier - 1),
    0
  );
  const correctPicks = breakdown.reduce((acc, sq) => acc + sq.correct_picks, 0);

  // Chaos bonus: +5 if 10 or more questions score any points
  const questionsWithPoints = breakdown.filter((sq) => sq.raw_score > 0).length;
  const chaosBonus = questionsWithPoints >= CHAOS_BONUS_THRESHOLD ? CHAOS_BONUS_POINTS : 0;

  const penalty = editPenalty(editCount);
  const rawWeekendScore = Math.min(baseScore + chaosBonus, SCORE_CAPS.weekend);
  const totalScore = rawWeekendScore * penalty;

  return {
    user_id: userId,
    race_id: raceId,
    total_score: Math.round(totalScore * 10000) / 10000,
    base_score: Math.round(baseScore * 10000) / 10000,
    difficulty_score: Math.round(difficultyScore * 10000) / 10000,
    edit_penalty: Math.round(penalty * 10000) / 10000,
    chaos_bonus: chaosBonus,
    correct_picks: correctPicks,
    submitted_at: submittedAt ?? null,
    breakdown,
  };
}

// ─────────────────────────────────────────────────────────────
// Freeze popularity snapshot
// ─────────────────────────────────────────────────────────────

export type RawPickCount = {
  question_id: string;
  option_id: string;
  pick_count: number;
};

export function computePopularitySnapshots(
  rawCounts: RawPickCount[],
  totalActiveEntries: number
): PopularitySnapshot[] {
  if (totalActiveEntries === 0) return [];

  return rawCounts.map((row) => ({
    question_id: row.question_id,
    option_id: row.option_id,
    popularity_percent: row.pick_count / totalActiveEntries,
  }));
}

// ─────────────────────────────────────────────────────────────
// Settle full race — orchestrates the full pipeline
// ─────────────────────────────────────────────────────────────

export type SettlementInput = {
  raceId: string;
  questions: PredictionQuestion[];
  results: RaceResult[];
  snapshots: PopularitySnapshot[];
  userPredictions: Array<{
    userId: string;
    answers: PredictionAnswer[];
    editCount: number;
    submittedAt?: string | null;
  }>;
};

export type SettlementOutput = {
  scores: RaceScoreResult[];
  settledAt: string;
};

export function settleRace(input: SettlementInput): SettlementOutput {
  const scores = input.userPredictions.map(({ userId, answers, editCount, submittedAt }) =>
    scoreUserPrediction(
      userId,
      input.raceId,
      input.questions,
      answers,
      input.results,
      input.snapshots,
      editCount,
      submittedAt
    )
  );

  // Deterministic ranking fallback chain:
  // 1. Higher total score
  // 2. Higher cumulative difficulty score
  // 3. More correct picks
  // 4. Earlier submission timestamp
  // 5. Stable user_id ordering for exact ties only
  scores.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (b.difficulty_score !== a.difficulty_score) {
      return b.difficulty_score - a.difficulty_score;
    }
    if (b.correct_picks !== a.correct_picks) {
      return b.correct_picks - a.correct_picks;
    }

    const aSubmitted = a.submitted_at ? new Date(a.submitted_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bSubmitted = b.submitted_at ? new Date(b.submitted_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (aSubmitted !== bSubmitted) {
      return aSubmitted - bSubmitted;
    }

    return a.user_id.localeCompare(b.user_id);
  });

  return {
    scores,
    settledAt: new Date().toISOString(),
  };
}
