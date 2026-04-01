import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ raceId: string }> }
) {
  const { raceId } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  // No auth required — public endpoint to show top picks for a race
  // Find the top-scored user for this race
  const { data: topScore } = await supabase
    .from("race_scores")
    .select("user_id, total_score")
    .eq("race_id", raceId)
    .order("total_score", { ascending: false })
    .limit(1)
    .single();

  if (!topScore)
    return NextResponse.json({ picks: null, message: "No scores yet for this race." });

  // Get their prediction
  const { data: prediction } = await supabase
    .from("predictions")
    .select("id")
    .eq("user_id", topScore.user_id)
    .eq("race_id", raceId)
    .eq("status", "active")
    .single();

  if (!prediction)
    return NextResponse.json({ picks: null, message: "Top player picks not available." });

  const { data: answers } = await supabase
    .from("prediction_answers")
    .select("question_id, option_id, pick_order")
    .eq("prediction_id", prediction.id)
    .order("pick_order");

  if (!answers)
    return NextResponse.json({ picks: null });

  // Group by question_id
  const picks: Record<string, string[]> = {};
  for (const ans of answers) {
    if (!picks[ans.question_id]) picks[ans.question_id] = [];
    picks[ans.question_id][ans.pick_order - 1] = ans.option_id;
  }

  // Clean up sparse arrays
  for (const key of Object.keys(picks)) {
    picks[key] = picks[key].filter(Boolean);
  }

  return NextResponse.json({
    picks,
    topScore: topScore.total_score,
  });
}
