import { NextResponse } from "next/server";
import { selectLatestPredictionVersionRows } from "@/lib/predictions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendRaceResultEmail } from "@/lib/email";
import {
  settleRace,
  type PredictionQuestion,
  type PredictionAnswer,
  type RaceResult,
  type PopularitySnapshot,
} from "@/lib/scoring/settleRace";
import {
  distributePool,
  rankUsers,
  DEFAULT_PAYOUT_MODEL,
  MINIMUM_PAID_ENTRANTS,
  type PayoutModel,
  type LeaguePayoutConfig,
} from "@/lib/scoring/distributePrizes";

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

function isLateJoiner(joinedAt: string | null, lockDeadline: string | null): boolean {
  if (!joinedAt || !lockDeadline) {
    return false;
  }

  return new Date(joinedAt).getTime() > new Date(lockDeadline).getTime();
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
    .select("race_locked, qualifying_starts_at, race_starts_at")
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
    .select("id, prediction_id, version_number, answers_json, created_at")
    .in("prediction_id", predictionIds)
    .order("version_number", { ascending: false })
    .order("created_at", { ascending: false });

  const latestByPrediction = selectLatestPredictionVersionRows(
    (allVersions ?? []).map((version) => ({
      id: version.id,
      prediction_id: version.prediction_id,
      version_number: version.version_number,
      answers_json: version.answers_json as Record<string, string[]>,
      created_at: version.created_at,
    }))
  );

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

  if (upsertErr)
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });

  // 7b. Send result emails (fire-and-forget — settlement must not fail if email fails)
  const { data: raceMeta } = await admin
    .from("races")
    .select("grand_prix_name")
    .eq("id", raceId)
    .single();

  if (raceMeta) {
    const scoredUserIds = scores.map((s) => s.user_id);
    const { data: authUsers } = await admin.auth.admin.listUsers();
    const emailByUserId = new Map(
      (authUsers?.users ?? [])
        .filter((u) => scoredUserIds.includes(u.id) && !!u.email)
        .map((u) => [u.id, u.email as string])
    );

    for (const score of scores) {
      const email = emailByUserId.get(score.user_id);
      if (!email) continue;
      sendRaceResultEmail({
        to: email,
        raceName: raceMeta.grand_prix_name,
        raceId,
        totalScore: score.total_score,
        correctPicks: score.correct_picks,
        totalQuestions: questions.length,
      }).catch(() => {});
    }
  }

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
      (m) => m.user_id === score.user_id && raceLeagueIds.has(m.league_id)
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
    await admin
      .from("league_scores")
      .upsert(leagueScoreRows, { onConflict: "league_id,user_id,race_id" });
  }

  // ── 9. Distribute league prize pools ──────────────────────────
  // For each league that has members who scored in this race,
  // compute payouts and credit winner balances.
  const distributionResults = [];
  const scoreByUser = new Map(scores.map((score) => [score.user_id, score]));
  // Use qualifying_starts_at if available, fallback to race_starts_at for determining late joiners.
  // This ensures all races (with or without qualifying) can correctly identify late joiners.
  const settlementLockDeadline = raceRow.qualifying_starts_at ?? raceRow.race_starts_at ?? null;

  if (leagueScoreRows.length > 0) {
    // Find all distinct leagues involved
    const leagueIds = [...new Set(leagueScoreRows.map((r) => r.league_id))];

    const { data: existingSettlements } = await admin
      .from("league_race_settlements")
      .select("league_id, status")
      .eq("race_id", raceId)
      .in("league_id", leagueIds);

    const settledLeagueIds = new Set(
      (existingSettlements ?? []).map((settlement) => settlement.league_id)
    );

    const { data: leagues } = await admin
      .from("leagues")
      .select("id, name, prize_pool, entry_fee_usdc, payout_model, payout_config")
      .in("id", leagueIds)
      .gt("prize_pool", 0);

    const { data: allLeagueMembers } = await admin
      .from("league_members")
      .select("league_id, user_id, paid, joined_at, stake_amount_usdc")
      .in("league_id", leagueIds);

    const { data: payoutProfiles } = await admin
      .from("profiles")
      .select("id, payouts_frozen")
      .in("id", scores.map((score) => score.user_id));

    const frozenByUserId = new Map(
      (payoutProfiles ?? []).map((profile) => [profile.id, profile.payouts_frozen === true])
    );

    for (const league of leagues ?? []) {
      if (settledLeagueIds.has(league.id)) {
        distributionResults.push({
          leagueId: league.id,
          status: "already_settled",
        });
        continue;
      }

      const paidLeagueMembers = (allLeagueMembers ?? []).filter(
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

        const { data: refundStatus, error: refundErr } = await admin.rpc(
          "apply_league_settlement",
          {
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
          }
        );

        if (refundErr) {
          throw refundErr;
        }

        if (refundStatus === "already_settled") {
          distributionResults.push({
            leagueId: league.id,
            status: "already_settled",
          });
          continue;
        }

        distributionResults.push({
          leagueId: league.id,
          status: "refunded",
          refundedCount: paidLeagueMembers.length,
        });
        continue;
      }

      // Get all league member scores for this race
      const leagueUserScores = leagueScoreRows
        .filter((r) => r.league_id === league.id)
        .map((r) => {
          const member = (allLeagueMembers ?? []).find(
            (leagueMember) =>
              leagueMember.league_id === league.id && leagueMember.user_id === r.user_id
          );
          const raceScore = scoreByUser.get(r.user_id);

          return {
            userId: r.user_id,
            score: Number(r.score),
            difficultyScore: raceScore?.difficulty_score ?? 0,
            correctPicks: raceScore?.correct_picks ?? 0,
            submittedAt: raceScore?.submitted_at ?? null,
            payoutEligible:
              member?.paid === true &&
              !isLateJoiner(member.joined_at ?? null, settlementLockDeadline),
            payoutFrozen: frozenByUserId.get(r.user_id) ?? false,
          };
        });

      if (leagueUserScores.length === 0) continue;

      const ranked = rankUsers(leagueUserScores);
      const distribution = distributePool(
        league.id,
        league.prize_pool,
        ranked,
        (league.payout_config as LeaguePayoutConfig | null) ?? null,
        ((league.payout_model as PayoutModel | null) ?? DEFAULT_PAYOUT_MODEL) as PayoutModel
      );

      const { data: settlementStatus, error: settlementErr } = await admin.rpc(
        "apply_league_settlement",
        {
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
        }
      );

      if (settlementErr) {
        throw settlementErr;
      }

      if (settlementStatus === "already_settled") {
        distributionResults.push({
          leagueId: league.id,
          status: "already_settled",
        });
        continue;
      }

      distributionResults.push({
        leagueId: league.id,
        status: "settled",
        prizePool: distribution.prizePool,
        payoutsCount: distribution.payouts.length,
        withheldAmount: distribution.withheldAmount,
        undistributed: distribution.undistributed,
      });
    }
  }

  return NextResponse.json({
    success: true,
    scores_computed: scores.length,
    distributions: distributionResults,
  });
}
