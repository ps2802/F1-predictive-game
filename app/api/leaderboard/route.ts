import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeSeasonScore } from "@/lib/scoring/seasonLeaderboard";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all race scores; join to races for race_starts_at (for streak ordering)
  const { data: allScores, error } = await supabase
    .from("race_scores")
    .select("user_id, race_id, total_score, races(race_starts_at)")
    .order("user_id");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // Fetch profile info for all users with scores
  const userIds = [...new Set((allScores ?? []).map((s) => s.user_id as string))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  // Group scores by user
  const byUser = new Map<
    string,
    Array<{ race_id: string; total_score: number; race_date?: string | null }>
  >();

  for (const row of allScores ?? []) {
    const userId = row.user_id as string;
    const entry = byUser.get(userId) ?? [];
    // The joined races relation may be null if column/join unavailable — fall back gracefully
    const racesRelation = row.races as { race_starts_at?: string } | null;
    entry.push({
      race_id: row.race_id as string,
      total_score: (row.total_score as number) ?? 0,
      race_date: racesRelation?.race_starts_at ?? null,
    });
    byUser.set(userId, entry);
  }

  // Compute adjusted season scores
  const entries = Array.from(byUser.entries())
    .map(([userId, scores]) => {
      const season = computeSeasonScore(userId, scores);
      const profile = profileMap.get(userId);
      return {
        user_id: userId,
        username: (profile?.username as string | null) ?? null,
        avatar_url: (profile?.avatar_url as string | null) ?? null,
        total_score: season.adjustedTotal,
        raw_total: season.rawTotal,
        loyalty_multiplier: season.loyaltyMultiplier,
        races_played: season.racesPlayed,
        races_dropped: season.racesDropped,
      };
    })
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 100);

  return NextResponse.json({ entries });
}
