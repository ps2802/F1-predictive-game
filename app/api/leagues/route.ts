import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_PAYOUT_MODEL,
  DEFAULT_PAYOUT_TIERS,
  type PayoutModel,
} from "@/lib/scoring/distributePrizes";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import {
  createLeagueWithoutRpc,
  shouldFallbackLeagueCreate,
} from "@/lib/leagueMutations";

const PayoutTier = z.object({
  place: z.number().int().min(1).max(10),
  percent: z.number().min(0).max(100),
});

const CreateLeagueBody = z.object({
  race_id: z.string().min(1),
  name: z.string().min(1).max(60),
  type: z.enum(["public", "private"]).default("private"),
  minimum_stake_usdc: z
    .number()
    .min(MINIMUM_LEAGUE_STAKE_USDC)
    .max(1000)
    .optional()
    .default(MINIMUM_LEAGUE_STAKE_USDC),
  creator_stake_usdc: z.number().min(MINIMUM_LEAGUE_STAKE_USDC).max(100_000),
  max_users: z.number().int().min(2).max(10000).default(1000),
  payout_model: z.enum(["manual", "skill_weighted"]).optional().default(DEFAULT_PAYOUT_MODEL),
  payout_config: z
    .object({
      tiers: z.array(PayoutTier).optional(),
      top_half_only: z.boolean().optional(),
    })
    .nullable()
    .optional(),
});

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

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });
  const client = supabase;

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const currentUser = user;

  const raceId = new URL(request.url).searchParams.get("raceId");

  // Get leagues user has joined
  const { data: memberships } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id);

  const joinedIds = new Set((memberships ?? []).map((m) => m.league_id));
  const joinedLeagueIds = [...joinedIds];

  async function fetchLeagueRows(mode: "discoverable" | "joined") {
    let query = client
      .from("leagues")
      .select("*, member_count")
      .eq("is_active", true);

    if (mode === "discoverable") {
      query = query.or(`type.eq.public,creator_id.eq.${currentUser.id}`);
    } else if (joinedLeagueIds.length > 0) {
      query = query.in("id", joinedLeagueIds);
    } else {
      return { data: [], error: null as null | { message: string } };
    }

    if (raceId) {
      query = query.eq("race_id", raceId);
    }

    let result = await query.order("created_at", { ascending: false });
    if (result.error && raceId && hasMissingLeagueRaceColumn(result.error.message)) {
      let fallbackQuery = client
        .from("leagues")
        .select("*, member_count")
        .eq("is_active", true);

      if (mode === "discoverable") {
        fallbackQuery = fallbackQuery.or(`type.eq.public,creator_id.eq.${currentUser.id}`);
      } else {
        fallbackQuery = fallbackQuery.in("id", joinedLeagueIds);
      }

      result = await fallbackQuery.order("created_at", { ascending: false });
    }

    return result;
  }

  const [discoverableResult, joinedResult] = await Promise.all([
    fetchLeagueRows("discoverable"),
    fetchLeagueRows("joined"),
  ]);

  const firstError = discoverableResult.error ?? joinedResult.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 400 });
  }

  const mergedLeagues = new Map<string, Record<string, unknown>>();
  for (const league of [...(discoverableResult.data ?? []), ...(joinedResult.data ?? [])]) {
    mergedLeagues.set(league.id as string, league);
  }

  const leagues = [...mergedLeagues.values()].sort((a, b) => {
    const aCreatedAt = new Date(String(a.created_at ?? 0)).getTime();
    const bCreatedAt = new Date(String(b.created_at ?? 0)).getTime();
    return bCreatedAt - aCreatedAt;
  });

  return NextResponse.json({
    leagues: leagues.map((l) => ({
      ...l,
      is_member: joinedIds.has(String(l.id)),
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateLeagueBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 });

  const {
    race_id,
    name,
    type,
    minimum_stake_usdc,
    creator_stake_usdc,
    max_users,
    payout_config,
    payout_model,
  } = parsed.data;
  const totalConfiguredPercent =
    payout_config?.tiers?.reduce((sum, tier) => sum + tier.percent, 0) ?? 0;

  if (creator_stake_usdc < minimum_stake_usdc) {
    return NextResponse.json(
      { error: "Your opening stake must be at least the league minimum." },
      { status: 400 }
    );
  }

  if (payout_model === "manual" && totalConfiguredPercent > 100) {
    return NextResponse.json(
      { error: "Manual payout tiers must add up to 100% or less." },
      { status: 400 }
    );
  }

  const normalizedPayoutConfig =
    payout_model === "manual"
      ? {
          tiers: payout_config?.tiers ?? DEFAULT_PAYOUT_TIERS,
          ...(payout_config?.top_half_only ? { top_half_only: true } : {}),
        }
      : payout_config?.top_half_only
        ? { top_half_only: true }
        : null;

  const { data: created, error: createErr } = await supabase.rpc("create_league_with_stake", {
    p_creator_id: user.id,
    p_race_id: race_id,
    p_name: name.trim(),
    p_type: type,
    p_max_users: max_users,
    p_min_stake_usdc: minimum_stake_usdc,
    p_creator_stake_usdc: creator_stake_usdc,
    p_payout_model: (payout_model ?? DEFAULT_PAYOUT_MODEL) as PayoutModel,
    p_payout_config: normalizedPayoutConfig,
  });

  if (createErr) {
    if (!shouldFallbackLeagueCreate(createErr.message)) {
      const status =
        createErr.message.includes("Insufficient balance") ? 402 : 400;
      return NextResponse.json({ error: createErr.message }, { status });
    }

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured." },
        { status: 500 }
      );
    }

    try {
      const fallback = await createLeagueWithoutRpc(admin, {
        creatorId: user.id,
        raceId: race_id,
        name,
        type,
        minimumStakeUsdc: minimum_stake_usdc,
        creatorStakeUsdc: creator_stake_usdc,
        maxUsers: max_users,
        payoutModel: (payout_model ?? DEFAULT_PAYOUT_MODEL) as PayoutModel,
        payoutConfig: normalizedPayoutConfig,
      });

      const { data: league, error } = await supabase
        .from("leagues")
        .select("*")
        .eq("id", fallback.leagueId)
        .single();

      if (error || !league) {
        return NextResponse.json(
          { error: error?.message ?? "League created but could not be loaded." },
          { status: 500 }
        );
      }

      return NextResponse.json({ league }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create league.";
      const status =
        message.includes("Insufficient balance")
          ? 402
          : message.includes("Race not found")
            ? 400
            : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const createdRow = Array.isArray(created) ? created[0] : created;
  if (!createdRow?.league_id) {
    return NextResponse.json({ error: "Failed to create league." }, { status: 500 });
  }

  const { data: league, error } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", createdRow.league_id)
    .single();

  if (error || !league) {
    return NextResponse.json({ error: error?.message ?? "League created but could not be loaded." }, { status: 500 });
  }

  return NextResponse.json({ league }, { status: 201 });
}
