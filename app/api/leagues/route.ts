import { NextResponse } from "next/server";
import { z } from "zod";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import {
  createLeagueWithoutRpc,
  shouldFallbackLeagueCreate,
} from "@/lib/leagueMutations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PayoutTier = z.object({
  place: z.number().int().min(1).max(10),
  percent: z.number().min(0).max(100),
});

const CreateLeagueBody = z.object({
  race_id: z.string().min(1, "Race is required."),
  name: z.string().min(1).max(60),
  type: z.enum(["public", "private"]).default("private"),
  minimum_stake_usdc: z.number().min(MINIMUM_LEAGUE_STAKE_USDC).max(1000),
  creator_stake_usdc: z.number().min(MINIMUM_LEAGUE_STAKE_USDC).max(1000),
  max_users: z.number().int().min(2).max(10000).default(1000),
  payout_model: z.enum(["manual", "skill_weighted"]).default("manual"),
  payout_config: z.object({ tiers: z.array(PayoutTier) }).nullable().optional(),
});

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Supabase env vars missing." },
        { status: 500 }
      ),
      supabase: null,
      user: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
      user: null,
    };
  }

  return { error: null, supabase, user };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser();
  if (auth.error || !auth.supabase || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const raceId = url.searchParams.get("raceId");

  let leagueQuery = auth.supabase
    .from("leagues")
    .select("*, member_count")
    .or(`type.eq.public,creator_id.eq.${auth.user.id}`)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (raceId) {
    leagueQuery = leagueQuery.eq("race_id", raceId);
  }

  const { data: leagues, error } = await leagueQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const leagueIds = (leagues ?? []).map((league) => league.id);
  const membershipQuery = auth.supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", auth.user.id);

  const { data: memberships, error: membershipsError } =
    raceId && leagueIds.length > 0
      ? await membershipQuery.in("league_id", leagueIds)
      : raceId
        ? { data: [], error: null }
        : await membershipQuery;

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 400 });
  }

  const joinedIds = new Set((memberships ?? []).map((membership) => membership.league_id));

  return NextResponse.json({
    leagues: (leagues ?? []).map((league) => ({
      ...league,
      is_member: joinedIds.has(league.id),
    })),
  });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (auth.error || !auth.supabase || !auth.user) {
    return auth.error;
  }

  const parsed = CreateLeagueBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  const {
    race_id,
    name,
    type,
    minimum_stake_usdc,
    creator_stake_usdc,
    max_users,
    payout_model,
    payout_config,
  } = parsed.data;

  if (creator_stake_usdc < minimum_stake_usdc) {
    return NextResponse.json(
      { error: "Creator stake must be at least the league minimum stake." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();

  let leagueId: string;
  let chargedAmountUsdc: number;

  const { data: createdLeagueResult, error: createLeagueError } = await auth.supabase.rpc(
    "create_league_with_stake",
    {
      p_creator_id: auth.user.id,
      p_race_id: race_id,
      p_name: name.trim(),
      p_type: type,
      p_max_users: max_users,
      p_min_stake_usdc: minimum_stake_usdc,
      p_creator_stake_usdc: creator_stake_usdc,
      p_payout_model: payout_model,
      p_payout_config: payout_config ?? null,
    }
  );

  if (createLeagueError) {
    if (!shouldFallbackLeagueCreate(createLeagueError.message) || !admin) {
      const status =
        createLeagueError.message.includes("Insufficient balance") ? 402 : 400;
      return NextResponse.json({ error: createLeagueError.message }, { status });
    }

    try {
      const fallback = await createLeagueWithoutRpc(admin, {
        creatorId: auth.user.id,
        raceId: race_id,
        name,
        type,
        minimumStakeUsdc: minimum_stake_usdc,
        creatorStakeUsdc: creator_stake_usdc,
        maxUsers: max_users,
        payoutModel: payout_model,
        payoutConfig: payout_config ?? null,
      });

      leagueId = fallback.leagueId;
      chargedAmountUsdc = fallback.chargedAmountUsdc;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create league.";
      const status =
        message.includes("Insufficient balance") ? 402 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  } else {
    const resultRow = Array.isArray(createdLeagueResult)
      ? createdLeagueResult[0]
      : createdLeagueResult;

    if (!resultRow?.league_id) {
      return NextResponse.json(
        { error: "League could not be created." },
        { status: 500 }
      );
    }

    leagueId = resultRow.league_id;
    chargedAmountUsdc = Number(
      resultRow.charged_amount_usdc ?? creator_stake_usdc
    );
  }

  const { data: league, error: leagueError } = await auth.supabase
    .from("leagues")
    .select("*")
    .eq("id", leagueId)
    .single();

  if (leagueError || !league) {
    return NextResponse.json(
      { error: leagueError?.message ?? "League created, but could not be loaded." },
      { status: 500 }
    );
  }

  const { data: activatedCount, error: activateErr } = await auth.supabase.rpc(
    "activate_user_predictions",
    { p_user_id: auth.user.id }
  );

  return NextResponse.json(
    {
      league,
      stakeAmountUsdc: chargedAmountUsdc,
      activatedCount: activatedCount ?? 0,
      ...(activateErr
        ? {
            activationWarning:
              "League created, but your draft predictions could not be activated automatically.",
          }
        : {}),
    },
    { status: 201 }
  );
}
