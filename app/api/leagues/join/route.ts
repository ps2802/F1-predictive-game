import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import {
  joinLeagueWithoutRpc,
  shouldFallbackLeagueJoin,
} from "@/lib/leagueMutations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

const JoinLeagueBody = z.object({
  invite_code: z.string().trim().min(1, "Invite code is required."),
  stake_amount_usdc: z
    .number()
    .min(MINIMUM_LEAGUE_STAKE_USDC, `Stake must be at least ${MINIMUM_LEAGUE_STAKE_USDC} USDC.`)
    .optional(),
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

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, entry_fee_usdc, member_count, max_users, is_active, prize_pool")
    .eq("invite_code", inviteCode)
    .single();

  if (!league) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 404 });
  }

  const stakeAmountUsdc =
    parsed.data.stake_amount_usdc ?? Math.max(Number(league.entry_fee_usdc ?? 0), MINIMUM_LEAGUE_STAKE_USDC);

  let chargedAmountUsdc = stakeAmountUsdc;
  const admin = createSupabaseAdminClient();

  const { data: joinResult, error: joinErr } = await supabase.rpc(
    "join_league_with_stake",
    {
      p_league_id: league.id,
      p_user_id: user.id,
      p_stake_amount_usdc: stakeAmountUsdc,
    }
  );

  if (joinErr) {
    if (!shouldFallbackLeagueJoin(joinErr.message) || !admin) {
      const isInsufficientBalance =
        joinErr.message?.includes("Insufficient balance") ||
        joinErr.code === "P0001";
      return NextResponse.json(
        {
          error: isInsufficientBalance
            ? "Insufficient balance. Please deposit USDC first."
            : joinErr.message,
        },
        { status: isInsufficientBalance ? 402 : 400 }
      );
    }

    try {
      const fallback = await joinLeagueWithoutRpc(admin, {
        league,
        userId: user.id,
        stakeAmountUsdc,
      });
      chargedAmountUsdc = fallback.chargedAmountUsdc;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not join this league.";
      const status = message.includes("Insufficient balance") ? 402 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  } else {
    const resultRow = Array.isArray(joinResult) ? joinResult[0] : joinResult;
    chargedAmountUsdc = Number(
      resultRow?.charged_amount_usdc ?? stakeAmountUsdc
    );
  }

  const { data: activatedCount, error: activateErr } = await supabase.rpc(
    "activate_user_predictions",
    { p_user_id: user.id }
  );

  return NextResponse.json({
    success: true,
    leagueId: league.id,
    stakeAmountUsdc: chargedAmountUsdc,
    activatedCount: activatedCount ?? 0,
    ...(activateErr
      ? {
          activationWarning:
            "You've joined the league, but your draft predictions could not be activated automatically. Please refresh or contact support if they still show as Draft.",
        }
      : {}),
  });
}
