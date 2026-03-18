import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  settleRace,
  type PredictionQuestion,
  type PredictionAnswer,
  type RaceResult,
  type PopularitySnapshot,
} from "@/lib/scoring/settleRace";

// Convert prediction_versions.answers_json to PredictionAnswer[] for the scoring engine.
// answers_json format: { [questionId]: [optionId, optionId, ...] }
function versionToAnswers(answersJson: Record<string, string[]>): PredictionAnswer[] {
  const result: PredictionAnswer[] = [];
  for (const [questionId, optionIds] of Object.entries(answersJson)) {
    for (let i = 0; i < optionIds.length; i++) {
      if (optionIds[i]) {
        result.push({ question_id: questionId, option_id: optionIds[i], pick_order: i + 1 });
      }
    }
  }
  return result;
}

// Admin-only: trigger race settlement + scoring
export async function POST(request: Request) {
  // Authenticate with anon client
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

  // Admin client for all reads/writes (bypasses RLS)
  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured." },
      { status: 503 }
    );

  // 0. Guard: refuse to settle an unlocked race.
  // Settlement must only run against a stable, frozen set of predictions.
  // A race is considered locked if race_locked = true OR qualifying_starts_at has passed.
  const { data: raceRow } = await admin
    .from("races")
    .select("race_locked, qualifying_starts_at")
    .eq("id", raceId)
    .single();

  if (!raceRow)
    return NextResponse.json({ error: "Race not found." }, { status: 404 });

  const deadlinePassed =
    raceRow.qualifying_starts_at != null &&
    new Date() >= new Date(raceRow.qualifying_starts_at);

  if (!raceRow.race_locked && !deadlinePassed) {
    return NextResponse.json(
      { error: "Race is not locked. Lock the race or wait for the qualifying deadline before settling." },
      { status: 400 }
    );
  }

  // 1. Load questions
  const { data: questions } = await admin
    .from("prediction_questions")
    .select("*")
    .eq("race_id", raceId);

  if (!questions?.length)
    return NextResponse.json({ error: "No questions found for this race." }, { status: 404 });

  // 2. Load results
  const { data: results } = await admin
    .from("race_results")
    .select("question_id, correct_option_id, pick_order")
    .eq("race_id", raceId);

  if (!results?.length)
    return NextResponse.json({ error: "No results found. Submit results first." }, { status: 400 });

  // 3. Try pre-frozen popularity snapshots first, then compute on-the-fly
  let snapshots: PopularitySnapshot[] = [];
  const { data: snapshotData } = await admin
    .from("pick_popularity_snapshots")
    .select("question_id, option_id, popularity_percent")
    .eq("race_id", raceId);

  if (snapshotData?.length) {
    snapshots = snapshotData as PopularitySnapshot[];
  } else {
    const { data: countData } = await admin.rpc("compute_pick_popularity", {
      p_race_id: raceId,
    });
    snapshots = (countData ?? []) as PopularitySnapshot[];
  }

  // 4. Load active predictions
  const { data: predictions } = await admin
    .from("predictions")
    .select("id, user_id, edit_count")
    .eq("race_id", raceId)
    .eq("status", "active");

  if (!predictions?.length)
    return NextResponse.json({
      success: true,
      message: "No active predictions to score.",
      scores_computed: 0,
    });

  const predictionIds = predictions.map((p) => p.id);

  // 5. Load frozen answer snapshots from prediction_versions.
  //    Use the highest version_number per prediction — this is the immutable state
  //    captured at the time of the user's last submission and cannot change retroactively.
  //    Ordering DESC means the first row per prediction_id is always the latest version.
  const { data: allVersions } = await admin
    .from("prediction_versions")
    .select("prediction_id, version_number, answers_json")
    .in("prediction_id", predictionIds)
    .order("version_number", { ascending: false });

  // Pick latest version per prediction
  const latestByPrediction = new Map<string, Record<string, string[]>>();
  for (const v of allVersions ?? []) {
    if (!latestByPrediction.has(v.prediction_id)) {
      latestByPrediction.set(v.prediction_id, v.answers_json as Record<string, string[]>);
    }
  }

  // 6. Run scoring engine using frozen snapshots
  const { scores } = settleRace({
    raceId,
    questions: questions as PredictionQuestion[],
    results: results as RaceResult[],
    snapshots,
    userPredictions: predictions
      .filter((p) => latestByPrediction.has(p.id)) // skip predictions with no version snapshot
      .map((p) => ({
        userId: p.user_id,
        answers: versionToAnswers(latestByPrediction.get(p.id)!),
        editCount: p.edit_count ?? 0,
      })),
  });

  // 7. Upsert race_scores
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

  const { error: upsertErr } = await admin
    .from("race_scores")
    .upsert(scoreRows, { onConflict: "user_id,race_id" });

  if (upsertErr)
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });

  // 8. Update league_scores for all affected users
  const { data: leagueMembers } = await admin
    .from("league_members")
    .select("league_id, user_id")
    .in("user_id", scores.map((s) => s.user_id));

  const leagueScoreRows = [];
  for (const score of scores) {
    const userLeagues = (leagueMembers ?? []).filter((m) => m.user_id === score.user_id);
    for (const lm of userLeagues) {
      leagueScoreRows.push({
        league_id: lm.league_id,
        user_id: score.user_id,
        race_id: raceId,
        score: score.total_score,
      });
    }
  }

  if (leagueScoreRows.length > 0) {
    await admin
      .from("league_scores")
      .upsert(leagueScoreRows, { onConflict: "league_id,user_id,race_id" });
  }

  return NextResponse.json({ success: true, scores_computed: scores.length });
}
