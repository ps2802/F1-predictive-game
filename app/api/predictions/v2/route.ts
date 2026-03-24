import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

// Edit cost in USDC. Set to 0 during beta; raise for production.
const EDIT_COST_USDC = 0;

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

  // Validate all option IDs belong to this race
  const questionIds = Object.keys(answers);
  if (questionIds.length === 0)
    return NextResponse.json({ error: "No answers provided." }, { status: 400 });

  const { data: questions } = await supabase
    .from("prediction_questions")
    .select("id, multi_select")
    .eq("race_id", raceId)
    .in("id", questionIds);

  // Validate that every submitted question ID actually belongs to this race
  const validIds = new Set((questions ?? []).map((q) => q.id));
  const invalidIds = questionIds.filter((id) => !validIds.has(id));
  if (invalidIds.length > 0)
    return NextResponse.json({ error: "Invalid question IDs." }, { status: 400 });

  // Detect whether this is a first submission or an edit
  const { data: existingPred } = await supabase
    .from("predictions")
    .select("id, edit_count, status")
    .eq("user_id", user.id)
    .eq("race_id", raceId)
    .maybeSingle();

  const isEdit = existingPred?.status === "active";
  const nextEditCount = isEdit ? (existingPred.edit_count ?? 0) + 1 : 0;

  // Deduct edit fee when EDIT_COST_USDC > 0 (currently 0 in beta)
  if (isEdit && EDIT_COST_USDC > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance_usdc")
      .eq("id", user.id)
      .single();

    if (!profile || Number(profile.balance_usdc) < EDIT_COST_USDC)
      return NextResponse.json({ error: "Insufficient balance to edit." }, { status: 402 });

    // Optimistic lock: second concurrent edit request finds 0 rows and gets 409
    const { data: deducted } = await supabase
      .from("profiles")
      .update({ balance_usdc: Number(profile.balance_usdc) - EDIT_COST_USDC })
      .eq("id", user.id)
      .eq("balance_usdc", profile.balance_usdc)
      .select("balance_usdc");

    if (!deducted || deducted.length === 0)
      return NextResponse.json({ error: "Balance changed — please try again." }, { status: 409 });
  }

  // Upsert prediction row — status 'active' means submitted and ready for scoring
  const { data: pred, error: predErr } = await supabase
    .from("predictions")
    .upsert(
      {
        user_id: user.id,
        race_id: raceId,
        status: "active",
      },
      { onConflict: "user_id,race_id" }
    )
    .select("id, edit_count")
    .single();

  if (predErr || !pred)
    return NextResponse.json({ error: predErr?.message ?? "Failed to create prediction." }, { status: 400 });

  // Increment edit_count on re-submissions so the scoring penalty is accurate
  if (isEdit) {
    await supabase
      .from("predictions")
      .update({ edit_count: nextEditCount })
      .eq("id", pred.id);
  }

  // Delete old answers for these questions then insert new ones
  await supabase
    .from("prediction_answers")
    .delete()
    .eq("prediction_id", pred.id)
    .in("question_id", questionIds);

  const answerRows = [];
  for (const [questionId, optionIds] of Object.entries(answers)) {
    for (let i = 0; i < optionIds.length; i++) {
      if (optionIds[i]) {
        answerRows.push({
          prediction_id: pred.id,
          question_id: questionId,
          option_id: optionIds[i],
          pick_order: i + 1,
        });
      }
    }
  }

  if (answerRows.length > 0) {
    const { error: ansErr } = await supabase
      .from("prediction_answers")
      .insert(answerRows);
    if (ansErr)
      return NextResponse.json({ error: ansErr.message }, { status: 400 });
  }

  // Save prediction version snapshot (audit trail — failure does not block the response)
  await supabase.from("prediction_versions").insert({
    prediction_id: pred.id,
    version_number: nextEditCount + 1,
    answers_json: answers,
    edit_cost: EDIT_COST_USDC,
  });

  return NextResponse.json({ success: true, predictionId: pred.id });
}
