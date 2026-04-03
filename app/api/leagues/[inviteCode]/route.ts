import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ inviteCode: string }> }
) {
  const { inviteCode } = await params;
  const normalizedCode = inviteCode.trim().toUpperCase();

  if (!normalizedCode) {
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured." },
      { status: 500 }
    );
  }

  const { data: league, error } = await admin
    .from("leagues")
    .select(
      "id, race_id, name, type, invite_code, entry_fee_usdc, prize_pool, member_count, max_users, is_active"
    )
    .eq("invite_code", normalizedCode)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!league) {
    return NextResponse.json({ error: "Invite code not found." }, { status: 404 });
  }

  let isMember = false;

  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: membership } = await supabase
        .from("league_members")
        .select("league_id")
        .eq("league_id", league.id)
        .eq("user_id", user.id)
        .maybeSingle();

      isMember = Boolean(membership);
    }
  }

  return NextResponse.json({
    league: {
      ...league,
      minimum_stake_usdc: Math.max(
        Number(league.entry_fee_usdc ?? 0),
        MINIMUM_LEAGUE_STAKE_USDC
      ),
      is_member: isMember,
    },
  });
}
