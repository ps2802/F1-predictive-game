import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_PAYOUT_MODEL,
  DEFAULT_PAYOUT_TIERS,
  type PayoutModel,
} from "@/lib/scoring/distributePrizes";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";

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

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raceId = new URL(request.url).searchParams.get("raceId");

  // Return public leagues + leagues the user is a member of
  let query = supabase
    .from("leagues")
    .select("*, member_count")
    .or(`type.eq.public,creator_id.eq.${user.id}`)
    .eq("is_active", true);

  if (raceId) {
    query = query.eq("race_id", raceId);
  }

  const { data: leagues, error } = await query.order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // Get leagues user has joined
  const { data: memberships } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id);

  const joinedIds = new Set((memberships ?? []).map((m) => m.league_id));

  return NextResponse.json({
    leagues: (leagues ?? []).map((l) => ({
      ...l,
      is_member: joinedIds.has(l.id),
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
    const status =
      createErr.message.includes("Insufficient balance") ? 402 : 400;
    return NextResponse.json({ error: createErr.message }, { status });
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
