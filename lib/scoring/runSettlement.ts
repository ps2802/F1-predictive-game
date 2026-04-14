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
  DEFAULT_PAYOUT_MODEL,
  MINIMUM_PAID_ENTRANTS,
  distributePool,
  rankUsers,
  type LeaguePayoutConfig,
  type PayoutModel,
} from "@/lib/scoring/distributePrizes";
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

function isLateJoiner(joinedAt: string | null, lockDeadline: string | null): boolean {
  if (!joinedAt || !lockDeadline) {
    return false;
  }

  return new Date(joinedAt).getTime() > new Date(lockDeadline).getTime();
}

export async function runSettlement(
  raceId: string,
  admin: SupabaseClient
): Promise<{ scores_computed: number; flagged_users: string[] }> {
  const { data: raceRow } = await admin
    .from("races")
    .select("qualifying_starts_at, race_starts_at")
    .eq("id", raceId)
    .single();

  if (!raceRow) {
    throw new Error("Race not found.");
  }

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

  if (!predictions?.length) return { scores_computed: 0, flagged_users: [] };

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
    breakdown_json: {
      questions: s.breakdown,
      chaos_bonus: s.chaos_bonus,
      correct_picks: s.correct_picks,
      submitted_at: s.submitted_at,
    },
    calculated_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await admin
    .from("race_scores")
    .upsert(scoreRows, { onConflict: "user_id,race_id" });

  if (upsertErr) throw new Error(upsertErr.message);

  // 8. Update league_scores for all affected users
  const { data: leagueMembers } = await admin
    .from("league_members")
    .select("league_id, user_id, paid, joined_at, stake_amount_usdc")
    .in("user_id", scores.map((s) => s.user_id));

  const { data: raceLeagues } = await admin
    .from("leagues")
    .select("id")
    .eq("race_id", raceId);

  const raceLeagueIds = new Set((raceLeagues ?? []).map((league) => league.id));

  const leagueScoreRows = [];
  for (const score of scores) {
    const userLeagues = (leagueMembers ?? []).filter(
      (member) => member.user_id === score.user_id && raceLeagueIds.has(member.league_id)
    );
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

  const scoreByUser = new Map(scores.map((score) => [score.user_id, score]));
  const settlementLockDeadline =
    raceRow.qualifying_starts_at ?? raceRow.race_starts_at ?? null;

  if (leagueScoreRows.length > 0) {
    const leagueIds = [...new Set(leagueScoreRows.map((row) => row.league_id))];

    const { data: existingSettlements, error: existingSettlementsErr } = await admin
      .from("league_race_settlements")
      .select("league_id")
      .eq("race_id", raceId)
      .in("league_id", leagueIds);

    if (existingSettlementsErr) {
      throw new Error(existingSettlementsErr.message);
    }

    const settledLeagueIds = new Set(
      (existingSettlements ?? []).map((settlement) => settlement.league_id)
    );

    const { data: leagues, error: leaguesErr } = await admin
      .from("leagues")
      .select("id, name, prize_pool, entry_fee_usdc, payout_model, payout_config")
      .in("id", leagueIds)
      .gt("prize_pool", 0);

    if (leaguesErr) {
      throw new Error(leaguesErr.message);
    }

    const { data: payoutProfiles, error: payoutProfilesErr } = await admin
      .from("profiles")
      .select("id, payouts_frozen")
      .in("id", scores.map((score) => score.user_id));

    if (payoutProfilesErr) {
      throw new Error(payoutProfilesErr.message);
    }

    const frozenByUserId = new Map(
      (payoutProfiles ?? []).map((profile) => [profile.id, profile.payouts_frozen === true])
    );

    for (const league of leagues ?? []) {
      if (settledLeagueIds.has(league.id)) {
        continue;
      }

      const paidLeagueMembers = (leagueMembers ?? []).filter(
        (member) => member.league_id === league.id && member.paid === true
      );

      if (
        Number(league.entry_fee_usdc) > 0 &&
        paidLeagueMembers.length < MINIMUM_PAID_ENTRANTS
      ) {
        const refunds = paidLeagueMembers.map((member) => ({
          userId: member.user_id,
          amount: Number(member.stake_amount_usdc ?? 0),
          description: `League refund: ${league.name} had fewer than ${MINIMUM_PAID_ENTRANTS} paid entrants`,
        }));

        const { error: refundErr } = await admin.rpc("apply_league_settlement", {
          p_league_id: league.id,
          p_race_id: raceId,
          p_status: "refunded",
          p_payout_model:
            ((league.payout_model as PayoutModel | null) ?? DEFAULT_PAYOUT_MODEL) as PayoutModel,
          p_prize_pool: league.prize_pool,
          p_paid_entrant_count: paidLeagueMembers.length,
          p_eligible_count: 0,
          p_withheld_amount: 0,
          p_undistributed_amount: 0,
          p_payouts_json: [],
          p_notes: `Refunded because league had fewer than ${MINIMUM_PAID_ENTRANTS} paid entrants.`,
          p_refunds_json: refunds,
        });

        if (refundErr) {
          throw new Error(refundErr.message);
        }

        continue;
      }

      const leagueUserScores = leagueScoreRows
        .filter((row) => row.league_id === league.id)
        .map((row) => {
          const member = (leagueMembers ?? []).find(
            (leagueMember) =>
              leagueMember.league_id === league.id && leagueMember.user_id === row.user_id
          );
          const raceScore = scoreByUser.get(row.user_id);

          return {
            userId: row.user_id,
            score: Number(row.score),
            difficultyScore: raceScore?.difficulty_score ?? 0,
            correctPicks: raceScore?.correct_picks ?? 0,
            submittedAt: raceScore?.submitted_at ?? null,
            payoutEligible:
              member?.paid === true &&
              !isLateJoiner(member.joined_at ?? null, settlementLockDeadline),
            payoutFrozen: frozenByUserId.get(row.user_id) ?? false,
          };
        });

      if (leagueUserScores.length === 0) {
        continue;
      }

      const ranked = rankUsers(leagueUserScores);
      const distribution = distributePool(
        league.id,
        Number(league.prize_pool ?? 0),
        ranked,
        (league.payout_config as LeaguePayoutConfig | null) ?? null,
        ((league.payout_model as PayoutModel | null) ?? DEFAULT_PAYOUT_MODEL) as PayoutModel
      );

      const { error: settlementErr } = await admin.rpc("apply_league_settlement", {
        p_league_id: league.id,
        p_race_id: raceId,
        p_status: "settled",
        p_payout_model:
          ((league.payout_model as PayoutModel | null) ?? DEFAULT_PAYOUT_MODEL) as PayoutModel,
        p_prize_pool: league.prize_pool,
        p_paid_entrant_count: paidLeagueMembers.length,
        p_eligible_count: ranked.filter((user) => user.payoutEligible).length,
        p_withheld_amount: distribution.withheldAmount,
        p_undistributed_amount: distribution.undistributed,
        p_payouts_json: distribution.payouts,
        p_notes: null,
        p_refunds_json: [],
      });

      if (settlementErr) {
        throw new Error(settlementErr.message);
      }
    }
  }

  // Fraud check — flag users with identical picks for admin review.
  // Payouts are NOT automatically blocked; the admin sees flagged users in the settle response.
  const predictionAnswers = predictions
    .filter((p) => latestByPrediction.has(p.id))
    .map((p) => ({ user_id: p.user_id, answers_json: latestByPrediction.get(p.id)!.answers_json }));
  const flaggedSet = detectIdenticalPicks(predictionAnswers);
  const flagged_users = Array.from(flaggedSet);

  return { scores_computed: scores.length, flagged_users };
}

/**
 * Detect users with identical answers to another user in the same settlement.
 * Returns a Set of user_ids that have exact duplicates — their payouts should be frozen.
 * Exported for use in admin tooling and future automated flagging.
 */
export function detectIdenticalPicks(
  predictions: Array<{ user_id: string; answers_json: Record<string, string[]> }>
): Set<string> {
  const flagged = new Set<string>();
  const seen = new Map<string, string>(); // fingerprint → first user_id

  for (const pred of predictions) {
    const fingerprint = JSON.stringify(
      Object.fromEntries(
        Object.entries(pred.answers_json)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, [...v].sort()])
      )
    );

    const existing = seen.get(fingerprint);
    if (existing) {
      flagged.add(pred.user_id);
      flagged.add(existing);
    } else {
      seen.set(fingerprint, pred.user_id);
    }
  }

  return flagged;
}
