import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildPredictionComparisons,
  parseBreakdown,
} from "@/lib/pastRaces";
import { selectLatestPredictionVersionRows } from "@/lib/predictions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ raceId: string }> }
) {
  const { raceId } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: score } = await supabase
    .from("race_scores")
    .select("total_score, base_score, difficulty_score, edit_penalty, breakdown_json, calculated_at")
    .eq("user_id", user.id)
    .eq("race_id", raceId)
    .single();

  if (!score)
    return NextResponse.json({ error: "No score found for this race." }, { status: 404 });

  const [
    { data: prediction },
    { data: questions },
    { data: results },
  ] = await Promise.all([
    supabase
      .from("predictions")
      .select("id")
      .eq("user_id", user.id)
      .eq("race_id", raceId)
      .maybeSingle(),
    supabase
      .from("prediction_questions")
      .select("id, race_id, category, question_type, label, multi_select, display_order, options:prediction_options(id, option_value, display_order)")
      .eq("race_id", raceId)
      .order("display_order", { ascending: true }),
    supabase
      .from("race_results")
      .select("race_id, question_id, correct_option_id, pick_order")
      .eq("race_id", raceId),
  ]);

  let latestAnswers: Record<string, string[]> = {};
  let submittedAt: string | null = null;

  if (prediction?.id) {
    const { data: versions } = await supabase
      .from("prediction_versions")
      .select("id, prediction_id, version_number, answers_json, created_at")
      .eq("prediction_id", prediction.id)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false });

    const latestVersion = selectLatestPredictionVersionRows(
      (versions ?? []).map((version) => ({
        id: version.id,
        prediction_id: version.prediction_id,
        version_number: version.version_number,
        answers_json: (version.answers_json ?? {}) as Record<string, string[]>,
        created_at: version.created_at,
      }))
    ).get(prediction.id);

    latestAnswers = latestVersion?.answers_json ?? {};
    submittedAt = latestVersion?.created_at ?? null;
  }

  const parsedBreakdown = parseBreakdown(
    (score.breakdown_json ?? null) as Record<string, unknown> | null
  );
  const comparisons = buildPredictionComparisons({
    questions: questions ?? [],
    answers: latestAnswers,
    results: results ?? [],
    breakdownQuestions: parsedBreakdown.questions,
  });

  // Count how many users scored strictly higher to derive rank (1-indexed)
  const { count: aboveCount } = await supabase
    .from("race_scores")
    .select("user_id", { count: "exact", head: true })
    .eq("race_id", raceId)
    .gt("total_score", score.total_score);

  const rank = (aboveCount ?? 0) + 1;

  return NextResponse.json({
    score,
    rank,
    comparisons,
    submittedAt: parsedBreakdown.submitted_at ?? submittedAt,
  });
}
