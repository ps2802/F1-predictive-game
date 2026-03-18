import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  settleRace,
  type PredictionQuestion,
  type PredictionAnswer,
  type RaceResult,
  type PopularitySnapshot,
} from "@/lib/scoring/settleRace";

// Admin-only: trigger race settlement + scoring
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin)
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const { raceId } = (await request.json()) as { raceId: string };
  if (!raceId)
    return NextResponse.json({ error: "Missing raceId." }, { status: 400 });

  // 1. Load questions
  const { data: questions } = await supabase
    .from("prediction_questions")
    .select("*")
    .eq("race_id", raceId);

  if (!questions?.length)
    return NextResponse.json({ error: "No questions found for this race." }, { status: 404 });

  // 2. Load results
  const { data: results } = await supabase
    .from("race_results")
    .select("question_id, correct_option_id, pick_order")
    .eq("race_id", raceId);

  if (!results?.length)
    return NextResponse.json({ error: "No results found. Submit results first." }, { status: 400 });

  // 3. Load popularity snapshots (or compute on-the-fly)
  let snapshots: PopularitySnapshot[] = [];
  const { data: snapshotData } = await supabase
    .from("pick_popularity_snapshots")
    .select("question_id, option_id, popularity_percent")
    .eq("race_id", raceId);

  if (snapshotData?.length) {
    snapshots = snapshotData;
  } else {
    // Compute popularity from active predictions
    const { data: countData } = await supabase.rpc("compute_pick_popularity", {
      p_race_id: raceId,
    });
    snapshots = (countData ?? []) as PopularitySnapshot[];
  }

  // 4. Load all active predictions with answers
  const { data: predictions } = await supabase
    .from("predictions")
    .select("id, user_id, edit_count")
    .eq("race_id", raceId)
    .eq("status", "active");

  if (!predictions?.length)
    return NextResponse.json({ success: true, message: "No active predictions to score.", scores: [] });

  // Load all answers in one query
  const predictionIds = predictions.map((p) => p.id);
  const { data: allAnswers } = await supabase
    .from("prediction_answers")
    .select("prediction_id, question_id, option_id, pick_order")
    .in("prediction_id", predictionIds);

  const answersByPrediction: Record<string, PredictionAnswer[]> = {};
  for (const ans of allAnswers ?? []) {
    if (!answersByPrediction[ans.prediction_id]) answersByPrediction[ans.prediction_id] = [];
    answersByPrediction[ans.prediction_id].push(ans);
  }

  // 5. Run scoring engine
  const { scores } = settleRace({
    raceId,
    questions: questions as PredictionQuestion[],
    results: results as RaceResult[],
    snapshots,
    userPredictions: predictions.map((p) => ({
      userId: p.user_id,
      answers: answersByPrediction[p.id] ?? [],
      editCount: p.edit_count ?? 0,
    })),
  });

  // 6. Upsert race_scores
  const scoreRows = scores.map((s) => ({
    user_id: s.user_id,
    race_id: raceId,
    total_score: s.total_score,
    base_score: s.base_score,
    difficulty_score: s.difficulty_score,
    edit_penalty: s.edit_penalty,
    breakdown_json: s.breakdown,
    calculated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabase
    .from("race_scores")
    .upsert(scoreRows, { onConflict: "user_id,race_id" });

  if (upsertErr)
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });

  // 7. Update league_scores
  const { data: leagueMembers } = await supabase
    .from("league_members")
    .select("league_id, user_id");

  const leagueScoreRows = [];
  for (const score of scores) {
    const leagues = (leagueMembers ?? []).filter((m) => m.user_id === score.user_id);
    for (const lm of leagues) {
      leagueScoreRows.push({
        league_id: lm.league_id,
        user_id: score.user_id,
        race_id: raceId,
        score: score.total_score,
      });
    }
  }

  if (leagueScoreRows.length > 0) {
    await supabase
      .from("league_scores")
      .upsert(leagueScoreRows, { onConflict: "league_id,user_id,race_id" });
  }

  return NextResponse.json({ success: true, scores_computed: scores.length });
}
