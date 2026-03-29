/**
 * lib/scoring/runSettlement.ts
 *
 * Core race-settlement logic extracted from the admin settle endpoint so it
 * can be called from both the HTTP handler and the async cron processor.
 *
 * Returns { scores_computed } on success or throws with a human-readable
 * message on any error. The caller is responsible for wrapping in try/catch
 * and persisting the job status.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findPredictionIdsMissingVersionRows,
  formatMissingPredictionVersionsError,
  selectLatestPredictionVersionRows,
} from "@/lib/predictions";
import {
  settleRace,
  type PredictionQuestion,
  type PredictionAnswer,
  type RaceResult,
  type PopularitySnapshot,
} from "@/lib/scoring/settleRace";

// Convert prediction_versions.answers_json to PredictionAnswer[].
// answers_json format: { [questionId]: [optionId, ...] }
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

export async function runSettlement(
  raceId: string,
  admin: SupabaseClient
): Promise<{ scores_computed: number }> {
  // 1. Load questions
  const { data: questions } = await admin
    .from("prediction_questions")
    .select("*")
    .eq("race_id", raceId);

  if (!questions?.length)
    throw new Error("No questions found for this race.");

  // 2. Load results
  const { data: results } = await admin
    .from("race_results")
    .select("question_id, correct_option_id, pick_order")
    .eq("race_id", raceId);

  if (!results?.length)
    throw new Error("No results found. Submit results first.");

  // 3. Try pre-frozen popularity snapshots, then compute on-the-fly
  let snapshots: PopularitySnapshot[] = [];
  const { data: snapshotData } = await admin
    .from("pick_popularity_snapshots")
    .select("question_id, option_id, popularity_percent")
    .eq("race_id", raceId);

  if (snapshotData?.length) {
    snapshots = snapshotData as PopularitySnapshot[];
  } else {
    const { data: countData, error: countErr } = await admin.rpc("compute_pick_popularity", {
      p_race_id: raceId,
    });
    if (countErr) {
      throw new Error(
        `Unable to load pick popularity for settlement: ${countErr.message}. Apply the latest Supabase migrations and retry.`
      );
    }
    snapshots = (countData ?? []) as PopularitySnapshot[];
  }

  // 4. Load active predictions
  const { data: predictions } = await admin
    .from("predictions")
    .select("id, user_id, edit_count")
    .eq("race_id", raceId)
    .eq("status", "active");

  if (!predictions?.length) return { scores_computed: 0 };

  const predictionIds = predictions.map((p) => p.id);

  // 5. Load frozen answer snapshots (latest version per prediction)
  const { data: allVersions, error: versionsErr } = await admin
    .from("prediction_versions")
    .select("id, prediction_id, version_number, answers_json, created_at")
    .in("prediction_id", predictionIds)
    .order("version_number", { ascending: false })
    .order("created_at", { ascending: false });

  if (versionsErr) {
    throw new Error(
      `Settlement requires prediction_versions and the current database is behind the app schema: ${versionsErr.message}`
    );
  }

  const latestByPrediction = selectLatestPredictionVersionRows(
    (allVersions ?? []).map((version) => ({
      id: version.id,
      prediction_id: version.prediction_id,
      version_number: version.version_number,
      answers_json: version.answers_json as Record<string, string[]>,
      created_at: version.created_at,
    }))
  );

  const missingPredictionIds = findPredictionIdsMissingVersionRows(
    predictionIds,
    latestByPrediction
  );

  if (missingPredictionIds.length > 0) {
    throw new Error(
      formatMissingPredictionVersionsError(
        missingPredictionIds.length,
        predictionIds.length
      )
    );
  }

  // 6. Run scoring engine
  const { scores } = settleRace({
    raceId,
    questions: questions as PredictionQuestion[],
    results: results as RaceResult[],
    snapshots,
    userPredictions: predictions
      .filter((p) => latestByPrediction.has(p.id))
      .map((p) => ({
        userId: p.user_id,
        answers: versionToAnswers(latestByPrediction.get(p.id)!.answers_json),
        editCount: p.edit_count ?? 0,
        submittedAt: latestByPrediction.get(p.id)?.created_at ?? null,
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
    breakdown_json: { questions: s.breakdown, chaos_bonus: s.chaos_bonus },
    calculated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await admin
    .from("race_scores")
    .upsert(scoreRows, { onConflict: "user_id,race_id" });

  if (upsertErr) throw new Error(upsertErr.message);

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
    const { error: leagueScoresErr } = await admin
      .from("league_scores")
      .upsert(leagueScoreRows, { onConflict: "league_id,user_id,race_id" });

    if (leagueScoresErr) throw new Error(leagueScoresErr.message);
  }

  return { scores_computed: scores.length };
}
