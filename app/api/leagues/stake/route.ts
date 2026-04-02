import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import {
  topUpLeagueWithoutRpc,
  shouldFallbackLeagueTopUp,
} from "@/lib/leagueMutations";
import { resolvePredictionWindow } from "@/lib/predictionWindows";

function hasMissingLeagueRaceColumn(message: string | undefined) {
  if (!message) {
    return false;
  }

  return (
    /Could not find the 'race_id' column of 'leagues'/i.test(message) ||
    /column\s+leagues\.race_id\s+does not exist/i.test(message) ||
    /column\s+"race_id"\s+of relation\s+"leagues"\s+does not exist/i.test(message)
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  if (await isRateLimited(`leagues-stake:${ip}`, 15, 60 * 1000)) {
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

  const { league_id, additional_stake_usdc } = (await request.json()) as {
    league_id?: string;
    additional_stake_usdc?: number;
  };

  if (!league_id?.trim()) {
    return NextResponse.json({ error: "League id is required." }, { status: 400 });
  }

  if (
    typeof additional_stake_usdc !== "number" ||
    Number.isNaN(additional_stake_usdc) ||
    additional_stake_usdc <= 0
  ) {
    return NextResponse.json(
      { error: "Additional stake must be greater than zero." },
      { status: 400 }
    );
  }

  let leagueResult = await supabase
    .from("leagues")
    .select("id, name, is_active, prize_pool, race_id")
    .eq("id", league_id.trim())
    .single();

  if (leagueResult.error && hasMissingLeagueRaceColumn(leagueResult.error.message)) {
    leagueResult = await supabase
      .from("leagues")
      .select("id, name, is_active, prize_pool")
      .eq("id", league_id.trim())
      .single();
  }

  const { data: league, error: leagueError } = leagueResult;
  if (leagueError || !league) {
    return NextResponse.json(
      { error: leagueError?.message ?? "League not found." },
      { status: 404 }
    );
  }

  if (!league.is_active) {
    return NextResponse.json({ error: "This league is no longer active." }, { status: 400 });
  }

  if ("race_id" in league && league.race_id) {
    const { data: race, error: raceError } = await supabase
      .from("races")
      .select("qualifying_starts_at, race_starts_at, quali_locked, race_locked")
      .eq("id", league.race_id)
      .maybeSingle();

    if (raceError) {
      return NextResponse.json({ error: raceError.message }, { status: 400 });
    }

    if (race) {
      const raceWindow = resolvePredictionWindow(race, "race");
      if (!raceWindow.lockAt) {
        if (raceWindow.locked) {
          return NextResponse.json(
            { error: "Stake increases are closed for this league." },
            { status: 403 }
          );
        }
      } else if (Date.now() >= new Date(raceWindow.lockAt).getTime()) {
        return NextResponse.json(
          { error: "Stake increases close 10 minutes before the race starts." },
          { status: 403 }
        );
      }
    }
  }

  const { data: membership, error: membershipError } = await supabase
    .from("league_members")
    .select("id")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 400 });
  }

  if (!membership) {
    return NextResponse.json(
      { error: "Join the league before increasing your stake." },
      { status: 400 }
    );
  }

  const { data: toppedUp, error: topUpError } = await supabase.rpc("top_up_league_stake", {
    p_league_id: league.id,
    p_user_id: user.id,
    p_additional_stake_usdc: additional_stake_usdc,
  });

  if (topUpError) {
    if (!shouldFallbackLeagueTopUp(topUpError.message)) {
      const status = topUpError.message.includes("Insufficient balance") ? 402 : 400;
      return NextResponse.json({ error: topUpError.message }, { status });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured." },
        { status: 500 }
      );
    }

    try {
      const fallback = await topUpLeagueWithoutRpc(admin, {
        league: {
          id: league.id,
          name: league.name,
          prize_pool: Number(league.prize_pool ?? 0),
          is_active: league.is_active,
        },
        userId: user.id,
        additionalStakeUsdc: additional_stake_usdc,
      });

      return NextResponse.json({
        success: true,
        leagueId: fallback.leagueId,
        addedStakeUsdc: fallback.chargedAmountUsdc,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to increase stake.";
      const status = message.includes("Insufficient balance") ? 402 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const toppedUpRow = Array.isArray(toppedUp) ? toppedUp[0] : toppedUp;

  return NextResponse.json({
    success: true,
    leagueId: league.id,
    addedStakeUsdc: toppedUpRow?.charged_amount_usdc ?? additional_stake_usdc,
  });
}
