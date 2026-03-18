/**
 * F1 PREDICTION PLATFORM — SCORING ENGINE
 *
 * Deterministic, replayable scoring pipeline.
 * Score = BasePoints × DifficultyMultiplier × ConfidenceMultiplier × EditPenalty
 *
 * Anti-herd: Difficulty = log2(1 / pickPopularity)
 * Edit penalty: 1 / (1 + edits × 0.08)
 * Score caps: Qualifying 150, Race 300, Weekend 400
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
};

export type RaceScoreResult = {
  user_id: string;
  race_id: string;
  total_score: number;
  base_score: number;
  difficulty_score: number;
  edit_penalty: number;
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
// Score a single question answer
// ─────────────────────────────────────────────────────────────

export function scoreQuestion(
  question: PredictionQuestion,
  userAnswers: PredictionAnswer[],
  results: RaceResult[],
  snapshots: PopularitySnapshot[]
): ScoredQuestion {
  const questionAnswers = userAnswers.filter(
    (a) => a.question_id === question.id
  );
  const questionResults = results.filter(
    (r) => r.question_id === question.id
  );
  const questionSnapshots = snapshots.filter(
    (s) => s.question_id === question.id
  );

  // Check each pick_order for correctness
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

      // Get popularity of this specific pick
      const snapshot = questionSnapshots.find(
        (s) => s.option_id === answer.option_id
      );
      const popularity = snapshot?.popularity_percent ?? 0.5;
      totalDifficulty += difficultyMultiplier(popularity);
    }
  }

  const isCorrect = correctPicks > 0;

  // Average difficulty across correct picks
  const avgDifficulty =
    correctPicks > 0 ? totalDifficulty / correctPicks : 1.0;

  const confMult = confidenceMultiplier(question.confidence_tier);

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
  editCount: number
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

  const penalty = editPenalty(editCount);
  const rawWeekendScore = Math.min(baseScore, SCORE_CAPS.weekend);
  const totalScore = rawWeekendScore * penalty;

  return {
    user_id: userId,
    race_id: raceId,
    total_score: Math.round(totalScore * 10000) / 10000,
    base_score: Math.round(baseScore * 10000) / 10000,
    difficulty_score: Math.round(difficultyScore * 10000) / 10000,
    edit_penalty: Math.round(penalty * 10000) / 10000,
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
  }>;
};

export type SettlementOutput = {
  scores: RaceScoreResult[];
  settledAt: string;
};

export function settleRace(input: SettlementInput): SettlementOutput {
  const scores = input.userPredictions.map(({ userId, answers, editCount }) =>
    scoreUserPrediction(
      userId,
      input.raceId,
      input.questions,
      answers,
      input.results,
      input.snapshots,
      editCount
    )
  );

  // Sort by total_score descending
  scores.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    // Tie-break: higher difficulty score
    return b.difficulty_score - a.difficulty_score;
  });

  return {
    scores,
    settledAt: new Date().toISOString(),
  };
}
