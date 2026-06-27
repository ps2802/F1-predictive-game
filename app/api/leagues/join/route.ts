import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { trackServer } from "@/lib/analytics.server";

const JoinLeagueBody = z.object({
  invite_code: z.string().trim().min(1, "Invite code is required."),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (await isRateLimited(`leagues-join:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

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

  const parsed = JoinLeagueBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  const inviteCode = parsed.data.invite_code.trim().toUpperCase();

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 500 });
  }

  const { data: league } = await admin
    .from("leagues")
    .select("id, name, member_count, max_users, is_active")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (!league) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 404 });
  }

  if (league.is_active === false) {
    return NextResponse.json({ error: "This league is no longer active." }, { status: 400 });
  }

  // Idempotent: already a member → succeed without changing anything.
  const { data: existingMembership } = await admin
    .from("league_members")
    .select("league_id")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json({ success: true, leagueId: league.id, alreadyMember: true });
  }

  // Capacity check (best-effort; a UNIQUE(league_id,user_id) guards duplicates).
  const { count: memberCount } = await admin
    .from("league_members")
    .select("league_id", { count: "exact", head: true })
    .eq("league_id", league.id);

  if (
    typeof league.max_users === "number" &&
    league.max_users > 0 &&
    (memberCount ?? 0) >= league.max_users
  ) {
    return NextResponse.json({ error: "This league is full." }, { status: 409 });
  }

  const { error: insertError } = await admin
    .from("league_members")
    .insert({ league_id: league.id, user_id: user.id });

  if (insertError) {
    // 23505 = the user joined concurrently — treat as success.
    if (insertError.code === "23505") {
      return NextResponse.json({ success: true, leagueId: league.id, alreadyMember: true });
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Keep the denormalized counter in sync with the actual membership count.
  const { count: updatedCount } = await admin
    .from("league_members")
    .select("league_id", { count: "exact", head: true })
    .eq("league_id", league.id);

  await admin
    .from("leagues")
    .update({ member_count: updatedCount ?? (memberCount ?? 0) + 1 })
    .eq("id", league.id);

  await trackServer("league_joined", { league_id: league.id }, user.id);

  return NextResponse.json({ success: true, leagueId: league.id });
}
