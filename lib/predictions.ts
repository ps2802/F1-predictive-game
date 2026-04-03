export type SubmittedAnswers = Record<string, string[]>;

export type PredictionQuestionDefinition = {
  id: string;
  question_type: string;
  multi_select: number;
};

export type PredictionOptionDefinition = {
  id: string;
  question_id: string;
};

export type PredictionAnswerRow = {
  question_id: string;
  option_id: string;
  pick_order: number;
};

type ValidationResult =
  | { ok: true; answerRows: PredictionAnswerRow[] }
  | { ok: false; error: string };

export type PredictionVersionRow = {
  id?: string;
  prediction_id: string;
  version_number: number;
  answers_json: SubmittedAnswers;
  created_at?: string | null;
};

export function validatePredictionAnswers(params: {
  answers: SubmittedAnswers;
  questions: PredictionQuestionDefinition[];
  options: PredictionOptionDefinition[];
}): ValidationResult {
  const { answers, questions, options } = params;

  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const optionIdsByQuestion = new Map<string, Set<string>>();

  for (const option of options) {
    const optionIds = optionIdsByQuestion.get(option.question_id) ?? new Set<string>();
    optionIds.add(option.id);
    optionIdsByQuestion.set(option.question_id, optionIds);
  }

  for (const questionId of Object.keys(answers)) {
    if (!questionMap.has(questionId)) {
      return { ok: false, error: "Invalid question IDs." };
    }
  }

  const answerRows: PredictionAnswerRow[] = [];

  for (const question of questions) {
    const picks = (answers[question.id] ?? []).filter(Boolean);

    if (picks.length < question.multi_select) {
      return {
        ok: false,
        error: `Please answer all questions before submitting. Missing: ${question.question_type.replace(/_/g, " ")}.`,
      };
    }

    if (picks.length > question.multi_select) {
      return {
        ok: false,
        error: `Too many picks submitted for ${question.question_type.replace(/_/g, " ")}.`,
      };
    }

    if (new Set(picks).size !== picks.length) {
      return {
        ok: false,
        error: `Duplicate picks are not allowed for ${question.question_type.replace(/_/g, " ")}.`,
      };
    }

    const validOptionIds = optionIdsByQuestion.get(question.id) ?? new Set<string>();
    for (const optionId of picks) {
      if (!validOptionIds.has(optionId)) {
        return {
          ok: false,
          error: `Invalid option submitted for ${question.question_type.replace(/_/g, " ")}.`,
        };
      }
    }

    picks.forEach((optionId, index) => {
      answerRows.push({
        question_id: question.id,
        option_id: optionId,
        pick_order: index + 1,
      });
    });
  }

  return { ok: true, answerRows };
}

export function selectLatestPredictionVersionRows(
  rows: PredictionVersionRow[]
): Map<string, PredictionVersionRow> {
  const latestByPrediction = new Map<string, PredictionVersionRow>();

  for (const row of rows) {
    const current = latestByPrediction.get(row.prediction_id);
    if (!current) {
      latestByPrediction.set(row.prediction_id, row);
      continue;
    }

    if (row.version_number > current.version_number) {
      latestByPrediction.set(row.prediction_id, row);
      continue;
    }

    if (row.version_number < current.version_number) {
      continue;
    }

    const rowCreatedAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    const currentCreatedAt = current.created_at
      ? new Date(current.created_at).getTime()
      : 0;

    if (rowCreatedAt > currentCreatedAt) {
      latestByPrediction.set(row.prediction_id, row);
      continue;
    }

    if (
      rowCreatedAt === currentCreatedAt &&
      row.id &&
      current.id &&
      row.id > current.id
    ) {
      latestByPrediction.set(row.prediction_id, row);
    }
  }

  return latestByPrediction;
}

export function selectLatestPredictionVersions(
  rows: PredictionVersionRow[]
): Map<string, SubmittedAnswers> {
  return new Map(
    Array.from(selectLatestPredictionVersionRows(rows).entries()).map(([predictionId, row]) => [
      predictionId,
      row.answers_json,
    ])
  );
}

export function findPredictionIdsMissingVersionRows(
  predictionIds: string[],
  latestByPrediction: Map<string, PredictionVersionRow>
): string[] {
  return predictionIds.filter((predictionId) => !latestByPrediction.has(predictionId));
}

export function formatMissingPredictionVersionsError(
  missingCount: number,
  totalCount: number
): string {
  const predictionLabel = totalCount === 1 ? "prediction" : "predictions";
  const verb = missingCount === 1 ? "is" : "are";

  if (missingCount === totalCount) {
    return `Cannot settle race: none of the ${totalCount} active ${predictionLabel} have a frozen snapshot in prediction_versions. Apply the latest Supabase migrations and backfill prediction_versions before retrying settlement.`;
  }

  return `Cannot settle race: ${missingCount} of ${totalCount} active ${predictionLabel} ${verb} missing a frozen snapshot in prediction_versions. Settlement was aborted to avoid partial scores.`;
}
