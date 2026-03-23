import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Answers = Record<string, string[]>; // question_id → option_id[]

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { raceId, answers } = (await request.json()) as {
    raceId: string;
    answers: Answers;
  };

  if (!raceId || !answers)
    return NextResponse.json({ error: "Missing raceId or answers." }, { status: 400 });

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
  const { error: versionErr } = await supabase.from("prediction_versions").insert({
    prediction_id: pred.id,
    version_number: (pred.edit_count ?? 0) + 1,
    answers_json: answers,
    edit_cost: 0,
  });
  if (versionErr) {
    console.error("prediction_versions insert failed:", versionErr.message);
  }

  return NextResponse.json({ success: true, predictionId: pred.id });
}
