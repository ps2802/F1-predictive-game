import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import {
  joinLeagueWithoutRpc,
  shouldFallbackLeagueJoin,
} from "@/lib/leagueMutations";
import { trackServer } from "@/lib/analytics.server";

export async function POST(request: NextRequest) {
  // Rate limit: 10 join attempts per IP per minute (prevents invite code brute-force)
  const ip = getClientIp(request.headers);
  if (await isRateLimited(`leagues-join:${ip}`, 10, 60 * 1000)) {
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
    .select("id, name, entry_fee_usdc, member_count, max_users, is_active, race_id, prize_pool")
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
    if (!shouldFallbackLeagueJoin(joinErr.message)) {
      const status = joinErr.message.includes("Insufficient balance")
        ? 402
        : joinErr.message.includes("Already a member")
          ? 409
          : 400;
      return NextResponse.json({ error: joinErr.message }, { status });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured." },
        { status: 500 }
      );
    }

    try {
      const fallback = await joinLeagueWithoutRpc(admin, {
        league: {
          ...league,
          entry_fee_usdc: Number(league.entry_fee_usdc ?? 0),
          prize_pool: Number(league.prize_pool ?? 0),
        },
        userId: user.id,
        stakeAmountUsdc: stake_amount_usdc,
      });

      await trackServer(
        "league_joined",
        {
          league_id: fallback.leagueId,
          race_id: league.race_id ?? undefined,
          stake_amount_usdc: fallback.chargedAmountUsdc,
        },
        user.id
      );

      return NextResponse.json({
        success: true,
        leagueId: fallback.leagueId,
        stakeAmountUsdc: fallback.chargedAmountUsdc,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join league.";
      const status = message.includes("Insufficient balance")
        ? 402
        : message.includes("Already a member")
          ? 409
          : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const joinedRow = Array.isArray(joined) ? joined[0] : joined;

  // Activate the user's draft prediction for this league's race (if applicable)
  if (league.race_id) {
    await supabase
      .from("predictions")
      .update({ status: "active" })
      .eq("user_id", user.id)
      .eq("race_id", league.race_id)
      .eq("status", "draft");
  }

  await trackServer(
    "league_joined",
    {
      league_id: league.id,
      race_id: league.race_id ?? undefined,
      stake_amount_usdc: Number(joinedRow?.charged_amount_usdc ?? stake_amount_usdc),
    },
    user.id
  );

  return NextResponse.json({
    success: true,
    leagueId: league.id,
    stakeAmountUsdc: joinedRow?.charged_amount_usdc ?? stake_amount_usdc,
  });
}
