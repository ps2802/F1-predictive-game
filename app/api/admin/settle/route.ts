import { NextResponse } from "next/server";
import { runSettlement } from "@/lib/scoring/runSettlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import { sendRaceResultEmail } from "@/lib/email";
import { trackServer } from "@/lib/analytics.server";

type RaceScoreRow = {
  user_id: string;
  total_score: number;
  breakdown_json: { questions?: Array<{ correct_picks?: number }> } | null;
};

// runSettlement stores per-question breakdown; sum correct picks across questions.
function countCorrectPicks(row: RaceScoreRow): number {
  const questions = row.breakdown_json?.questions ?? [];
  return questions.reduce((sum, q) => sum + (q.correct_picks ?? 0), 0);
}

// Admin-only: trigger race settlement + scoring (free game — no payouts)
export async function POST(request: Request): Promise<NextResponse> {
  // Authenticate with anon client
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAdminEmail(user.email))
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

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

  // 1. Run scoring engine. runSettlement upserts race_scores and league_scores
  //    (money-free: total_score per race and per league member).
  let settlementResult: { scores_computed: number; flagged_users: string[] };
  try {
    settlementResult = await runSettlement(raceId, admin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Settlement failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { scores_computed, flagged_users } = settlementResult;

  // 2. Send result emails (fire-and-forget — settlement must not fail if email fails).
  if (scores_computed > 0) {
    await sendResultEmails(admin, raceId);
  }

  await trackServer("race_scored", {
    race_id: raceId,
    scores_computed,
  });

  return NextResponse.json({
    success: true,
    scores_computed,
    ...(flagged_users.length > 0 && {
      flagged_users,
      fraud_warning: `${flagged_users.length} user(s) submitted identical picks — review the leaderboard.`,
    }),
  });
}

// Read the freshly-upserted race_scores and notify each scored player.
// Failures are swallowed so settlement always succeeds even if email is down.
async function sendResultEmails(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  raceId: string
): Promise<void> {
  const { data: raceMeta } = await admin
    .from("races")
    .select("grand_prix_name")
    .eq("id", raceId)
    .single();

  if (!raceMeta) return;

  const { count: totalQuestions } = await admin
    .from("prediction_questions")
    .select("id", { count: "exact", head: true })
    .eq("race_id", raceId);

  const { data: scoreRows } = await admin
    .from("race_scores")
    .select("user_id, total_score, breakdown_json")
    .eq("race_id", raceId);

  const scores = (scoreRows ?? []) as RaceScoreRow[];
  if (scores.length === 0) return;

  const scoredUserIds = new Set(scores.map((s) => s.user_id));
  const { data: authUsers } = await admin.auth.admin.listUsers();
  const emailByUserId = new Map(
    (authUsers?.users ?? [])
      .filter((u) => scoredUserIds.has(u.id) && !!u.email)
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
      correctPicks: countCorrectPicks(score),
      totalQuestions: totalQuestions ?? 0,
    }).catch(() => {});
  }
}
