import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildLeaderboard } from "@/lib/leaderboard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params;

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase admin client not configured." }, { status: 500 });
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("league_members")
    .select("user_id")
    .eq("league_id", leagueId);

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 400 });
  }

  const memberIds = [...new Set((memberships ?? []).map((member) => member.user_id))];
  if (memberIds.length === 0) {
    return NextResponse.json({ entries: [] });
  }

  const [{ data: profiles, error: profilesError }, { data: scores, error: scoresError }, { data: predictions, error: predictionsError }] =
    await Promise.all([
      admin.from("profiles").select("id, username, avatar_url").in("id", memberIds),
      admin.from("race_scores").select("user_id, total_score").in("user_id", memberIds),
      admin.from("predictions").select("user_id, race_id").in("user_id", memberIds),
    ]);

  const firstError = profilesError ?? scoresError ?? predictionsError;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  return NextResponse.json({
    entries: buildLeaderboard({
      profiles: profiles ?? [],
      scores: scores ?? [],
      predictions: predictions ?? [],
    }),
  });
}
