import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validatePredictionAnswers } from "@/lib/predictions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

const PredictionBody = z.object({
  raceId: z.string().min(1),
  answers: z.record(z.string(), z.array(z.string())),
});

export async function POST(request: NextRequest) {
  // Rate limit: 60 prediction submits per user per minute
  const ip = getClientIp(request.headers);
  if (isRateLimited(`predictions:${ip}`, 60, 60 * 1000)) {
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

  // Check race is not locked (manual flag or qualifying deadline passed)
  const { data: race } = await supabase
    .from("races")
    .select("race_locked, qualifying_starts_at")
    .eq("id", raceId)
    .single();

  if (!race)
    return NextResponse.json({ error: "Race not found." }, { status: 404 });

  const pastDeadline =
    race.qualifying_starts_at != null &&
    new Date() >= new Date(race.qualifying_starts_at);

  if (race.race_locked || pastDeadline)
    return NextResponse.json({ error: "Predictions locked for this race." }, { status: 403 });

  const questionIds = Object.keys(answers);
  if (questionIds.length === 0)
    return NextResponse.json({ error: "No answers provided." }, { status: 400 });

  const { data: allRaceQuestions, error: questionsErr } = await supabase
    .from("prediction_questions")
    .select("id, question_type, multi_select")
    .eq("race_id", raceId);

  if (questionsErr)
    return NextResponse.json({ error: questionsErr.message }, { status: 400 });

  const validIds = new Set((allRaceQuestions ?? []).map((q) => q.id));
  const invalidIds = questionIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0)
    return NextResponse.json({ error: "Invalid question IDs." }, { status: 400 });

  const raceQuestionIds = (allRaceQuestions ?? []).map((question) => question.id);
  const { data: questionOptions, error: optionsErr } = await supabase
    .from("prediction_options")
    .select("id, question_id")
    .in("question_id", raceQuestionIds);

  if (optionsErr)
    return NextResponse.json({ error: optionsErr.message }, { status: 400 });

  const validation = validatePredictionAnswers({
    answers,
    questions: (allRaceQuestions ?? []).map((question) => ({
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

  // Check if user has any paid league membership — if so, predictions go active immediately.
  // Otherwise, predictions stay as draft until they join and pay a league.
  const { data: paidMemberships } = await supabase
    .from("league_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("paid", true)
    .limit(1);

  const hasPaidLeague = (paidMemberships?.length ?? 0) > 0;

  const { data: existingPrediction, error: existingPredictionErr } = await supabase
    .from("predictions")
    .select("id, edit_count")
    .eq("user_id", user.id)
    .eq("race_id", raceId)
    .maybeSingle();

  if (existingPredictionErr)
    return NextResponse.json({ error: existingPredictionErr.message }, { status: 400 });

  const nextStatus = hasPaidLeague ? "active" : "draft";

  const predictionMutation = existingPrediction
    ? supabase
        .from("predictions")
        .update({
          status: nextStatus,
          edit_count: (existingPrediction.edit_count ?? 0) + 1,
        })
        .eq("id", existingPrediction.id)
    : supabase.from("predictions").insert({
        user_id: user.id,
        race_id: raceId,
        status: nextStatus,
        edit_count: 0,
      });

  const { data: pred, error: predErr } = await predictionMutation
    .select("id, edit_count")
    .single();

  if (predErr || !pred)
    return NextResponse.json({ error: predErr?.message ?? "Failed to create prediction." }, { status: 400 });

  // Replace the stored answer set with the validated payload.
  const { error: deleteErr } = await supabase
    .from("prediction_answers")
    .delete()
    .eq("prediction_id", pred.id);

  if (deleteErr)
    return NextResponse.json({ error: deleteErr.message }, { status: 400 });

  const answerRows = validation.answerRows.map((row) => ({
    prediction_id: pred.id,
    question_id: row.question_id,
    option_id: row.option_id,
    pick_order: row.pick_order,
  }));

  if (answerRows.length > 0) {
    const { error: ansErr } = await supabase
      .from("prediction_answers")
      .insert(answerRows);
    if (ansErr)
      return NextResponse.json({ error: ansErr.message }, { status: 400 });
  }

  // Save the frozen version that settlement will score against.
  const { error: versionErr } = await supabase.from("prediction_versions").insert({
    prediction_id: pred.id,
    version_number: (pred.edit_count ?? 0) + 1,
    answers_json: answers,
    edit_cost: 0,
  });

  if (versionErr)
    return NextResponse.json({ error: versionErr.message }, { status: 400 });

  return NextResponse.json({
    success: true,
    predictionId: pred.id,
    status: nextStatus,
  });
}
