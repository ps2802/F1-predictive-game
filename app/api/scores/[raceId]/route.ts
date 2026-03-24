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

  // Count how many users scored strictly higher to derive rank (1-indexed)
  const { count: aboveCount } = await supabase
    .from("race_scores")
    .select("user_id", { count: "exact", head: true })
    .eq("race_id", raceId)
    .gt("total_score", score.total_score);

  const rank = (aboveCount ?? 0) + 1;

  return NextResponse.json({ score, rank });
}
