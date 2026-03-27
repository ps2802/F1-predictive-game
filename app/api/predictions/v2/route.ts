import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validatePredictionAnswers } from "@/lib/predictions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { PREDICTION_EDIT_FEE_USDC } from "@/lib/gameRules";
import { resolvePredictionWindow } from "@/lib/predictionWindows";

const PredictionBody = z.object({
  raceId: z.string().min(1),
  answers: z.record(z.string(), z.array(z.string())),
});

function normalizeAnswers(answers: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(answers)
      .map(([questionId, picks]) => [questionId, picks.filter(Boolean)])
      .filter(([, picks]) => picks.length > 0)
  );
}

function haveSamePicks(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export async function POST(request: NextRequest) {
  // Rate limit: 60 prediction submits per user per minute
  const ip = getClientIp(request.headers);
  if (await isRateLimited(`predictions:${ip}`, 60, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PredictionBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 });

  const { raceId, answers } = parsed.data;

  // Check race timing windows.
  const { data: race } = await supabase
    .from("races")
    .select("qualifying_starts_at, race_starts_at, quali_locked, race_locked")
    .eq("id", raceId)
    .single();

  if (!race)
    return NextResponse.json({ error: "Race not found." }, { status: 404 });

  const questionIds = Object.keys(answers);
  if (questionIds.length === 0)
    return NextResponse.json({ error: "No answers provided." }, { status: 400 });

  const { data: allRaceQuestions, error: questionsErr } = await supabase
    .from("prediction_questions")
    .select("id, category, question_type, multi_select")
    .eq("race_id", raceId);

  if (questionsErr)
    return NextResponse.json({ error: questionsErr.message }, { status: 400 });

  const validIds = new Set((allRaceQuestions ?? []).map((q) => q.id));
  const invalidIds = questionIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0)
    return NextResponse.json({ error: "Invalid question IDs." }, { status: 400 });

  const questionsById = new Map((allRaceQuestions ?? []).map((question) => [question.id, question]));
  const qualifyingWindow = resolvePredictionWindow(race, "qualifying");
  const raceWindow = resolvePredictionWindow(race, "race");

  const touchedSessions = new Set<"qualifying" | "race">();
  for (const questionId of questionIds) {
    const question = questionsById.get(questionId);
    if (!question) continue;
    touchedSessions.add(question.category === "qualifying" ? "qualifying" : "race");
  }

  for (const session of touchedSessions) {
    const windowState = session === "qualifying" ? qualifyingWindow : raceWindow;
    if (!windowState.editable) {
      return NextResponse.json(
        {
          error:
            session === "qualifying"
              ? "Qualifying predictions are locked for this race."
              : "Grand Prix predictions are locked for this race.",
        },
        { status: 403 }
      );
    }
  }

  const raceQuestionIds = (allRaceQuestions ?? []).map((question) => question.id);
  const { data: questionOptions, error: optionsErr } = await supabase
    .from("prediction_options")
    .select("id, question_id")
    .in("question_id", raceQuestionIds);

  if (optionsErr)
    return NextResponse.json({ error: optionsErr.message }, { status: 400 });

  const { data: existingPrediction, error: existingPredictionErr } = await supabase
    .from("predictions")
    .select("id, edit_count")
    .eq("user_id", user.id)
    .eq("race_id", raceId)
    .maybeSingle();

  if (existingPredictionErr)
    return NextResponse.json({ error: existingPredictionErr.message }, { status: 400 });

  const existingAnswers: Record<string, string[]> = {};

  if (existingPrediction?.id) {
    const { data: storedAnswers, error: storedAnswersErr } = await supabase
      .from("prediction_answers")
      .select("question_id, option_id, pick_order")
      .eq("prediction_id", existingPrediction.id)
      .order("pick_order");

    if (storedAnswersErr) {
      return NextResponse.json({ error: storedAnswersErr.message }, { status: 400 });
    }

    for (const storedAnswer of storedAnswers ?? []) {
      const picks = existingAnswers[storedAnswer.question_id] ?? [];
      picks[storedAnswer.pick_order - 1] = storedAnswer.option_id;
      existingAnswers[storedAnswer.question_id] = picks;
    }
  }

  const submittedAnswers = normalizeAnswers(answers);
  const mergedAnswers = normalizeAnswers({
    ...existingAnswers,
    ...submittedAnswers,
  });
  const mergedQuestionIds = Object.keys(mergedAnswers);

  const validation = validatePredictionAnswers({
    answers: mergedAnswers,
    questions: (allRaceQuestions ?? [])
      .filter((question) => mergedQuestionIds.includes(question.id))
      .map((question) => ({
        id: question.id,
        question_type: question.question_type,
        multi_select: question.multi_select,
      })),
    options: (questionOptions ?? []).map((option) => ({
      id: option.id,
      question_id: option.question_id,
    })),
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const changedQuestionIds = new Set<string>();
  for (const questionId of new Set([...Object.keys(existingAnswers), ...mergedQuestionIds])) {
    const before = existingAnswers[questionId] ?? [];
    const after = mergedAnswers[questionId] ?? [];
    if (!haveSamePicks(before, after)) {
      changedQuestionIds.add(questionId);
    }
  }

  if (changedQuestionIds.size === 0) {
    return NextResponse.json({
      success: true,
      predictionId: existingPrediction?.id ?? null,
      status: "active",
      chargedEditFee: false,
      editFeeUsdc: 0,
    });
  }

  let shouldChargeEditFee = false;
  for (const questionId of changedQuestionIds) {
    const question = questionsById.get(questionId);
    if (!question) continue;
    const windowState =
      question.category === "qualifying" ? qualifyingWindow : raceWindow;

    if (!windowState.editable) {
      return NextResponse.json(
        {
          error:
            question.category === "qualifying"
              ? "Qualifying predictions are locked for this race."
              : "Grand Prix predictions are locked for this race.",
        },
        { status: 403 }
      );
    }

    if (windowState.paidEdit) {
      if (!existingPrediction?.id) {
        return NextResponse.json(
          {
            error:
              question.category === "qualifying"
                ? "You must submit qualifying picks before the lock window to use the paid edit window."
                : "You must submit Grand Prix picks before the lock window to use the paid edit window.",
          },
          { status: 403 }
        );
      }
      shouldChargeEditFee = true;
    }
  }

  const { data: submissionResult, error: submissionErr } = await supabase.rpc(
    "record_prediction_submission",
    {
      p_user_id: user.id,
      p_race_id: raceId,
      p_answers_json: mergedAnswers,
      p_answer_rows: validation.answerRows,
      p_status: "active",
      p_increment_edit_count: shouldChargeEditFee,
      p_edit_fee_usdc: shouldChargeEditFee ? PREDICTION_EDIT_FEE_USDC : 0,
      p_edit_description: shouldChargeEditFee
        ? "Prediction edit fee during live edit window"
        : "Prediction submission",
    }
  );

  if (submissionErr) {
    const status =
      submissionErr.message.includes("Insufficient balance") ? 402 : 400;
    return NextResponse.json({ error: submissionErr.message }, { status });
  }

  const resultRow = Array.isArray(submissionResult) ? submissionResult[0] : submissionResult;
  if (!resultRow?.prediction_id) {
    return NextResponse.json({ error: "Failed to save prediction." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    predictionId: resultRow.prediction_id,
    status: "active",
    chargedEditFee: shouldChargeEditFee,
    editFeeUsdc: shouldChargeEditFee ? PREDICTION_EDIT_FEE_USDC : 0,
  });
}
