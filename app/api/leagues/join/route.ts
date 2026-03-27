import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";

export async function POST(request: NextRequest) {
  // Rate limit: 10 join attempts per IP per minute (prevents invite code brute-force)
  const ip = getClientIp(request.headers);
  if (isRateLimited(`leagues-join:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invite_code, stake_amount_usdc } = (await request.json()) as {
    invite_code: string;
    stake_amount_usdc?: number;
  };
  if (!invite_code?.trim())
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });

  if (
    typeof stake_amount_usdc !== "number" ||
    Number.isNaN(stake_amount_usdc) ||
    stake_amount_usdc < MINIMUM_LEAGUE_STAKE_USDC
  ) {
    return NextResponse.json(
      { error: `Stake amount must be at least ${MINIMUM_LEAGUE_STAKE_USDC} USDC.` },
      { status: 400 }
    );
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, entry_fee_usdc, member_count, max_users, is_active")
    .eq("invite_code", invite_code.trim().toUpperCase())
    .single();

  if (!league)
    return NextResponse.json({ error: "Invalid invite code." }, { status: 404 });

  if (!league.is_active)
    return NextResponse.json({ error: "This league is no longer active." }, { status: 400 });

  if (league.member_count >= league.max_users)
    return NextResponse.json({ error: "League is full." }, { status: 400 });

  const { data: joined, error: joinErr } = await supabase.rpc("join_league_with_stake", {
    p_league_id: league.id,
    p_user_id: user.id,
    p_stake_amount_usdc: stake_amount_usdc,
  });

  if (joinErr) {
    const status = joinErr.message.includes("Insufficient balance")
      ? 402
      : joinErr.message.includes("Already a member")
        ? 409
        : 400;
    return NextResponse.json({ error: joinErr.message }, { status });
  }

  const joinedRow = Array.isArray(joined) ? joined[0] : joined;

  return NextResponse.json({
    success: true,
    leagueId: league.id,
    stakeAmountUsdc: joinedRow?.charged_amount_usdc ?? stake_amount_usdc,
  });
}
