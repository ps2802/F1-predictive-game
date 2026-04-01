import {
  selectLatestPredictionVersionRows,
  type PredictionVersionRow,
  type SubmittedAnswers,
} from "./predictions";

export type ScoreBreakdownQuestion = {
  question_id: string;
  question_type: string;
  category: "qualifying" | "race" | "chaos";
  label?: string;
  base_points: number;
  difficulty_multiplier: number;
  confidence_multiplier: number;
  raw_score: number;
  is_correct: boolean;
};

export type ScoreBreakdown = {
  questions: ScoreBreakdownQuestion[];
  chaos_bonus: number;
  correct_picks?: number;
  submitted_at?: string | null;
};

export type PredictionReviewStatus =
  | "correct"
  | "partial"
  | "wrong"
  | "unanswered";

export type PredictionComparison = {
  question_id: string;
  label: string;
  category: "qualifying" | "race" | "chaos";
  question_type: string;
  user_picks: string[];
  actual_results: string[];
  user_pick: string | null;
  actual_result: string | null;
  status: PredictionReviewStatus;
  points_earned: number;
};

export type PastRaceData = {
  race_id: string;
  round: number;
  name: string;
  country: string;
  race_date: string;
  race_starts_at: string | null;
  flag: string;
  status: "scored" | "pending";
  total_score: number | null;
  calculated_at: string | null;
  submitted_at: string | null;
  edit_penalty: number | null;
  breakdown: ScoreBreakdown;
  comparisons: PredictionComparison[];
};

type RaceRow = {
  id: string;
  round: number;
  name: string;
  country: string;
  race_date: string;
  race_starts_at: string | null;
};

type ScoreRow = {
  race_id: string;
  total_score: number;
  base_score?: number;
  difficulty_score?: number;
  edit_penalty?: number;
  breakdown_json: Record<string, unknown> | ScoreBreakdownQuestion[] | null;
  calculated_at: string | null;
};

type PredictionRow = {
  id: string;
  race_id: string;
};

type QuestionOptionRow = {
  id: string;
  option_value: string;
  display_order?: number | null;
};

type QuestionRow = {
  id: string;
  race_id: string;
  category: "qualifying" | "race" | "chaos";
  question_type: string;
  label: string;
  multi_select?: number | null;
  display_order?: number | null;
  options?: QuestionOptionRow[] | null;
};

type ResultRow = {
  race_id?: string;
  question_id: string;
  correct_option_id: string;
  pick_order: number;
};

// Map of race IDs to flag emojis
const COUNTRY_FLAGS: Record<string, string> = {
  Australia: "🇦🇺",
  China: "🇨🇳",
  Japan: "🇯🇵",
  "United States": "🇺🇸",
  Canada: "🇨🇦",
  Monaco: "🇲🇨",
  Spain: "🇪🇸",
  Austria: "🇦🇹",
  "Great Britain": "🇬🇧",
  Belgium: "🇧🇪",
  Hungary: "🇭🇺",
  Netherlands: "🇳🇱",
  Italy: "🇮🇹",
  Azerbaijan: "🇦🇿",
  Singapore: "🇸🇬",
  Mexico: "🇲🇽",
  Brazil: "🇧🇷",
  Qatar: "🇶🇦",
  "United Arab Emirates": "🇦🇪",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeQuestions(
  rawQuestions: unknown
): ScoreBreakdownQuestion[] {
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  return rawQuestions
    .filter(isObject)
    .map((question) => {
      const category: ScoreBreakdownQuestion["category"] =
        question.category === "qualifying" ||
        question.category === "race" ||
        question.category === "chaos"
          ? question.category
          : "race";

      return {
        question_id:
          typeof question.question_id === "string" ? question.question_id : "",
        question_type:
          typeof question.question_type === "string" ? question.question_type : "",
        category,
        label: typeof question.label === "string" ? question.label : undefined,
        base_points:
          typeof question.base_points === "number" ? question.base_points : 0,
        difficulty_multiplier:
          typeof question.difficulty_multiplier === "number"
            ? question.difficulty_multiplier
            : 1,
        confidence_multiplier:
          typeof question.confidence_multiplier === "number"
            ? question.confidence_multiplier
            : 1,
        raw_score: typeof question.raw_score === "number" ? question.raw_score : 0,
        is_correct: question.is_correct === true,
      };
    })
    .filter((question) => question.question_id);
}

export function parseBreakdown(
  raw: Record<string, unknown> | ScoreBreakdownQuestion[] | null | undefined
): ScoreBreakdown {
  if (!raw) {
    return { questions: [], chaos_bonus: 0 };
  }

  if (Array.isArray(raw)) {
    return {
      questions: normalizeQuestions(raw),
      chaos_bonus: 0,
    };
  }

  const questions = normalizeQuestions(raw.questions);
  const chaosBonus =
    typeof raw.chaos_bonus === "number" ? raw.chaos_bonus : 0;
  const correctPicks =
    typeof raw.correct_picks === "number" ? raw.correct_picks : undefined;
  const submittedAt =
    typeof raw.submitted_at === "string" ? raw.submitted_at : null;

  return {
    questions,
    chaos_bonus: chaosBonus,
    correct_picks: correctPicks,
    submitted_at: submittedAt,
  };
}

function formatOptionValues(optionIds: string[], optionValueById: Map<string, string>) {
  return optionIds
    .map((optionId) => optionValueById.get(optionId))
    .filter((value): value is string => Boolean(value));
}

function joinValues(values: string[]) {
  return values.length > 0 ? values.join(", ") : null;
}

function sameOrderedOptions(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameUnorderedOptions(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);
  if (leftSet.size !== right.length) {
    return false;
  }

  return right.every((value) => leftSet.has(value));
}

function isSetBasedQuestion(questionType: string) {
  return (
    questionType === "teams_q3" ||
    questionType === "points_finishers" ||
    questionType === "both_cars_q3" ||
    questionType === "p5_to_p10"
  );
}

function resolveComparisonStatus(params: {
  questionType: string;
  userOptionIds: string[];
  actualOptionIds: string[];
  pointsEarned: number;
}): PredictionReviewStatus {
  const { questionType, userOptionIds, actualOptionIds, pointsEarned } = params;

  if (userOptionIds.length === 0) {
    return "unanswered";
  }

  const exactMatch = isSetBasedQuestion(questionType)
    ? sameUnorderedOptions(userOptionIds, actualOptionIds)
    : sameOrderedOptions(userOptionIds, actualOptionIds);

  if (exactMatch) {
    return "correct";
  }

  if (pointsEarned > 0) {
    return "partial";
  }

  return "wrong";
}

export function buildPredictionComparisons(params: {
  questions: QuestionRow[];
  answers: SubmittedAnswers;
  results: ResultRow[];
  breakdownQuestions: ScoreBreakdownQuestion[];
}): PredictionComparison[] {
  const breakdownByQuestionId = new Map(
    params.breakdownQuestions.map((question) => [question.question_id, question])
  );

  return [...params.questions]
    .sort(
      (left, right) =>
        (left.display_order ?? Number.MAX_SAFE_INTEGER) -
        (right.display_order ?? Number.MAX_SAFE_INTEGER)
    )
    .map((question) => {
      const optionValueById = new Map(
        (question.options ?? [])
          .slice()
          .sort(
            (left, right) =>
              (left.display_order ?? Number.MAX_SAFE_INTEGER) -
              (right.display_order ?? Number.MAX_SAFE_INTEGER)
          )
          .map((option) => [option.id, option.option_value])
      );

      const userOptionIds = (params.answers[question.id] ?? []).filter(Boolean);
      const actualOptionIds = params.results
        .filter((result) => result.question_id === question.id)
        .sort((left, right) => left.pick_order - right.pick_order)
        .map((result) => result.correct_option_id);

      const userPicks = formatOptionValues(userOptionIds, optionValueById);
      const actualResults = formatOptionValues(actualOptionIds, optionValueById);
      const breakdownQuestion = breakdownByQuestionId.get(question.id);
      const pointsEarned = breakdownQuestion?.raw_score ?? 0;

      return {
        question_id: question.id,
        label: breakdownQuestion?.label ?? question.label,
        category: question.category,
        question_type: question.question_type,
        user_picks: userPicks,
        actual_results: actualResults,
        user_pick: joinValues(userPicks),
        actual_result: joinValues(actualResults),
        status: resolveComparisonStatus({
          questionType: question.question_type,
          userOptionIds,
          actualOptionIds,
          pointsEarned,
        }),
        points_earned: pointsEarned,
      };
    });
}

export function buildPastRacesList(params: {
  races: RaceRow[];
  scores: ScoreRow[];
  predictions: PredictionRow[];
  predictionVersions: PredictionVersionRow[];
  questions: QuestionRow[];
  results: ResultRow[];
}): PastRaceData[] {
  const scoresMap = new Map(params.scores.map((score) => [score.race_id, score]));
  const predictionsByRaceId = new Map(
    params.predictions.map((prediction) => [prediction.race_id, prediction])
  );
  const latestPredictionVersions = selectLatestPredictionVersionRows(
    params.predictionVersions
  );
  const questionsByRaceId = new Map<string, QuestionRow[]>();

  for (const question of params.questions) {
    const existingQuestions = questionsByRaceId.get(question.race_id) ?? [];
    existingQuestions.push(question);
    questionsByRaceId.set(question.race_id, existingQuestions);
  }

  const resultsByRaceId = new Map<string, ResultRow[]>();
  for (const result of params.results) {
    const raceId = result.race_id;
    if (!raceId) {
      continue;
    }

    const existingResults = resultsByRaceId.get(raceId) ?? [];
    existingResults.push(result);
    resultsByRaceId.set(raceId, existingResults);
  }

  return params.races
    .map((race) => {
      const score = scoresMap.get(race.id);
      const prediction = predictionsByRaceId.get(race.id);
      const latestPredictionVersion = prediction
        ? latestPredictionVersions.get(prediction.id)
        : undefined;
      const breakdown = parseBreakdown(score?.breakdown_json);
      const flag = COUNTRY_FLAGS[race.country] || "🏁";
      const status: "scored" | "pending" = score?.calculated_at ? "scored" : "pending";
      const comparisons = buildPredictionComparisons({
        questions: questionsByRaceId.get(race.id) ?? [],
        answers: latestPredictionVersion?.answers_json ?? {},
        results: resultsByRaceId.get(race.id) ?? [],
        breakdownQuestions: breakdown.questions,
      });

      return {
        race_id: race.id,
        round: race.round,
        name: race.name,
        country: race.country,
        race_date: race.race_date,
        race_starts_at: race.race_starts_at,
        flag,
        status,
        total_score: score?.total_score ?? null,
        calculated_at: score?.calculated_at ?? null,
        submitted_at: breakdown.submitted_at ?? latestPredictionVersion?.created_at ?? null,
        edit_penalty: score?.edit_penalty ?? null,
        breakdown,
        comparisons,
      };
    })
    .filter((race) => race.status === "scored")
    .sort((left, right) => {
      const leftTime = new Date(left.race_starts_at || left.race_date).getTime();
      const rightTime = new Date(right.race_starts_at || right.race_date).getTime();
      return rightTime - leftTime;
    });
}

export function getMainPredictions(comparisons: PredictionComparison[]) {
  return comparisons.filter((comparison) => {
    const mainTypes = ["winner", "podium", "qualifying"];
    return mainTypes.some((type) => comparison.question_type.includes(type));
  });
}
