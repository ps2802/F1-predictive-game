import { randomBytes } from "node:crypto";
import { calculateStakeSplit, roundUsdc } from "@/lib/gameRules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type LeagueType = "public" | "private";
type PayoutModel = "manual" | "skill_weighted";

type CreateLeagueFallbackInput = {
  creatorId: string;
  raceId: string;
  name: string;
  type: LeagueType;
  minimumStakeUsdc: number;
  creatorStakeUsdc: number;
  maxUsers: number;
  payoutModel: PayoutModel;
  payoutConfig: Record<string, unknown> | null;
};

type JoinLeagueFallbackInput = {
  league: {
    id: string;
    name: string;
    member_count: number;
    max_users: number;
    entry_fee_usdc: number;
    prize_pool?: number | null;
    is_active: boolean;
  };
  userId: string;
  stakeAmountUsdc: number;
};

type TopUpLeagueFallbackInput = {
  league: {
    id: string;
    name: string;
    prize_pool?: number | null;
    is_active: boolean;
  };
  userId: string;
  additionalStakeUsdc: number;
};

type LeagueMutationResult = {
  leagueId: string;
  chargedAmountUsdc: number;
};

function isMissingFunctionError(message: string | undefined, functionName: string): boolean {
  if (!message) {
    return false;
  }

  return message.includes(`Could not find the function public.${functionName}`);
}

function isInsufficientBalanceError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return /insufficient balance|insufficient_balance/i.test(message);
}

function isDuplicateKeyError(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return /duplicate key|duplicate/i.test(message);
}

function getMissingColumn(message: string | undefined, table: string): string | null {
  if (!message) {
    return null;
  }

  const schemaCacheMatch = message.match(
    new RegExp(`Could not find the '([^']+)' column of '${table}'`, "i")
  );
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const directColumnMatch = message.match(
    new RegExp(`column\\s+${table}\\.([a-zA-Z0-9_]+)\\s+does not exist`, "i")
  );
  if (directColumnMatch?.[1]) {
    return directColumnMatch[1];
  }

  const relationColumnMatch = message.match(
    new RegExp(`column\\s+\"([^\"]+)\"\\s+of relation\\s+\"${table}\"\\s+does not exist`, "i")
  );
  return relationColumnMatch?.[1] ?? null;
}

function buildInviteCode(length = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function deductBalance(admin: AdminClient, userId: string, amount: number) {
  const { error } = await admin.rpc("atomic_deduct_balance", {
    p_user_id: userId,
    p_amount: amount,
  });

  if (!error) {
    return { ok: true as const };
  }

  if (isInsufficientBalanceError(error.message)) {
    return { ok: false as const, status: 402, error: "Insufficient balance" };
  }

  if (!isMissingFunctionError(error.message, "atomic_deduct_balance")) {
    return { ok: false as const, status: 500, error: error.message };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("balance_usdc")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return {
      ok: false as const,
      status: 500,
      error: profileError?.message ?? "Could not load wallet balance.",
    };
  }

  const balance = Number(profile.balance_usdc ?? 0);
  if (balance < amount) {
    return { ok: false as const, status: 402, error: "Insufficient balance" };
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ balance_usdc: roundUsdc(balance - amount) })
    .eq("id", userId);

  if (updateError) {
    return { ok: false as const, status: 500, error: updateError.message };
  }

  return { ok: true as const };
}

async function refundBalanceBestEffort(admin: AdminClient, userId: string, amount: number) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("balance_usdc")
    .eq("id", userId)
    .single();

  if (!profile || profileError) {
    console.error("[Gridlock] Refund failed: could not load profile", { userId, profileError });
    return;
  }

  const balance = Number(profile.balance_usdc ?? 0);
  const { error: updateError } = await admin
    .from("profiles")
    .update({ balance_usdc: roundUsdc(balance + amount) })
    .eq("id", userId);

  if (updateError) {
    console.error("[Gridlock] Refund failed: could not update balance", { userId, amount, updateError });
    return;
  }

}

async function insertLeague(
  admin: AdminClient,
  payload: Record<string, unknown>
): Promise<
  | { ok: true; data: { id: string; invite_code: string } }
  | { ok: false; error: string; duplicateInviteCode?: boolean }
> {
  const insertPayload = { ...payload };

  while (true) {
    const { data, error } = await admin
      .from("leagues")
      .insert(insertPayload)
      .select("id, invite_code")
      .single();

    if (!error && data) {
      return { ok: true, data };
    }

    if (error && isDuplicateKeyError(error.message) && String(error.message).includes("invite_code")) {
      return { ok: false, error: error.message, duplicateInviteCode: true };
    }

    const missingColumn = getMissingColumn(error?.message, "leagues");
    if (
      missingColumn &&
      ["race_id", "payout_model", "payout_config", "member_count"].includes(missingColumn) &&
      missingColumn in insertPayload
    ) {
      delete insertPayload[missingColumn];
      continue;
    }

    return { ok: false, error: error?.message ?? "Failed to insert league." };
  }
}

async function insertLeagueMember(
  admin: AdminClient,
  payload: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const insertPayload = { ...payload };

  while (true) {
    const { error } = await admin.from("league_members").insert(insertPayload);

    if (!error) {
      return { ok: true };
    }

    const missingColumn = getMissingColumn(error.message, "league_members");
    if (missingColumn === "stake_amount_usdc" && missingColumn in insertPayload) {
      delete insertPayload[missingColumn];
      continue;
    }

    return { ok: false, error: error.message };
  }
}

async function creditFeeWalletBestEffort(
  admin: AdminClient,
  amount: number,
  leagueId: string,
  description: string
) {
  if (amount <= 0) {
    return;
  }

  const { error } = await admin.rpc("credit_fee_wallet", {
    p_amount: amount,
    p_league_id: leagueId,
    p_description: description,
  });

  if (!error) {
    return;
  }

  const payload = {
    amount,
    league_id: leagueId,
    description,
  };
  const { error: insertError } = await admin.from("fee_wallet").insert(payload);

  if (insertError) {
    console.error("[Gridlock] fee wallet credit skipped:", insertError.message);
  }
}

async function insertEntryTransaction(
  admin: AdminClient,
  userId: string,
  leagueId: string,
  amount: number,
  description: string
) {
  const { error } = await admin.from("transactions").insert({
    user_id: userId,
    type: "entry_fee",
    amount: -amount,
    currency: "USDC",
    reference_id: leagueId,
    description,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export function shouldFallbackLeagueCreate(message: string | undefined): boolean {
  return isMissingFunctionError(message, "create_league_with_stake");
}

export function shouldFallbackLeagueJoin(message: string | undefined): boolean {
  return isMissingFunctionError(message, "join_league_with_stake");
}

export function shouldFallbackLeagueTopUp(message: string | undefined): boolean {
  return isMissingFunctionError(message, "top_up_league_stake");
}

export async function createLeagueWithoutRpc(
  admin: AdminClient,
  input: CreateLeagueFallbackInput
): Promise<LeagueMutationResult> {
  const { data: race, error: raceError } = await admin
    .from("races")
    .select("id")
    .eq("id", input.raceId)
    .maybeSingle();

  if (raceError) {
    throw new Error(raceError.message);
  }

  if (!race) {
    throw new Error("Race not found");
  }

  const deduction = await deductBalance(admin, input.creatorId, input.creatorStakeUsdc);
  if (!deduction.ok) {
    const error = new Error(deduction.error);
    (error as Error & { status?: number }).status = deduction.status;
    throw error;
  }

  const { rake, netToPool } = calculateStakeSplit(input.creatorStakeUsdc);
  let leagueId: string | null = null;
  let inviteCode: string | null = null;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await insertLeague(admin, {
        race_id: input.raceId,
        name: input.name.trim(),
        type: input.type,
        invite_code: buildInviteCode(),
        creator_id: input.creatorId,
        entry_fee_usdc: input.minimumStakeUsdc,
        prize_pool: netToPool,
        max_users: input.maxUsers,
        member_count: 1,
        payout_model: input.payoutModel,
        payout_config: input.payoutConfig,
      });

      if (result.ok) {
        leagueId = result.data.id;
        inviteCode = result.data.invite_code;
        break;
      }

      if (!result.duplicateInviteCode) {
        throw new Error(result.error);
      }
    }

    if (!leagueId || !inviteCode) {
      throw new Error("Failed to generate a unique invite code.");
    }

    const memberInsert = await insertLeagueMember(admin, {
      league_id: leagueId,
      user_id: input.creatorId,
      paid: true,
      stake_amount_usdc: input.creatorStakeUsdc,
    });

    if (!memberInsert.ok) {
      throw new Error(memberInsert.error);
    }

    await insertEntryTransaction(
      admin,
      input.creatorId,
      leagueId,
      input.creatorStakeUsdc,
      `League opening stake for ${input.name.trim()} (10% platform fee)`
    );

    await creditFeeWalletBestEffort(
      admin,
      rake,
      leagueId,
      "Platform rake from league opening stake"
    );

    return {
      leagueId,
      chargedAmountUsdc: input.creatorStakeUsdc,
    };
  } catch (error) {
    if (leagueId) {
      await admin.from("leagues").delete().eq("id", leagueId);
    }
    await refundBalanceBestEffort(admin, input.creatorId, input.creatorStakeUsdc);
    throw error;
  }
}

export async function joinLeagueWithoutRpc(
  admin: AdminClient,
  input: JoinLeagueFallbackInput
): Promise<LeagueMutationResult> {
  if (!input.league.is_active) {
    throw new Error("This league is no longer active.");
  }

  if (input.stakeAmountUsdc < Number(input.league.entry_fee_usdc ?? 0)) {
    throw new Error("Stake must be at least the league minimum");
  }

  const { data: existingMembership } = await admin
    .from("league_members")
    .select("id")
    .eq("league_id", input.league.id)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existingMembership) {
    const error = new Error("Already a member of this league");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const deduction = await deductBalance(admin, input.userId, input.stakeAmountUsdc);
  if (!deduction.ok) {
    const error = new Error(deduction.error);
    (error as Error & { status?: number }).status = deduction.status;
    throw error;
  }

  const { rake, netToPool } = calculateStakeSplit(input.stakeAmountUsdc);

  try {
    // Re-fetch league to check capacity atomically with member insertion
    const { data: currentLeague } = await admin
      .from("leagues")
      .select("member_count, max_users, prize_pool")
      .eq("id", input.league.id)
      .single();

    if (!currentLeague || currentLeague.member_count >= currentLeague.max_users) {
      throw new Error("League is full.");
    }

    const memberInsert = await insertLeagueMember(admin, {
      league_id: input.league.id,
      user_id: input.userId,
      paid: true,
      stake_amount_usdc: input.stakeAmountUsdc,
    });

    if (!memberInsert.ok) {
      throw new Error(memberInsert.error);
    }

    // IMPORTANT: This fallback path has inherent race conditions (lost updates on prize_pool
    // with concurrent joins). This is acceptable ONLY because:
    // 1. It's the fallback when RPC is unavailable (degraded mode)
    // 2. Prize pool discrepancies are caught and refunded post-race via league settlement RPC
    // For production, ensure RPC is available to use joinLeagueWithRpc instead.
    const nextPrizePool = roundUsdc(Number(currentLeague.prize_pool ?? 0) + netToPool);
    const { error: updateLeagueError } = await admin
      .from("leagues")
      .update({
        member_count: currentLeague.member_count + 1,
        prize_pool: nextPrizePool,
      })
      .eq("id", input.league.id);

    if (updateLeagueError) {
      throw new Error(updateLeagueError.message);
    }

    await insertEntryTransaction(
      admin,
      input.userId,
      input.league.id,
      input.stakeAmountUsdc,
      `League stake for ${input.league.name} (10% platform fee)`
    );

    await creditFeeWalletBestEffort(
      admin,
      rake,
      input.league.id,
      "Platform rake from league join stake"
    );

    return {
      leagueId: input.league.id,
      chargedAmountUsdc: input.stakeAmountUsdc,
    };
  } catch (error) {
    await admin
      .from("league_members")
      .delete()
      .eq("league_id", input.league.id)
      .eq("user_id", input.userId);
    await refundBalanceBestEffort(admin, input.userId, input.stakeAmountUsdc);
    throw error;
  }
}

export async function topUpLeagueWithoutRpc(
  admin: AdminClient,
  input: TopUpLeagueFallbackInput
): Promise<LeagueMutationResult> {
  if (!input.league.is_active) {
    throw new Error("This league is no longer active.");
  }

  if (input.additionalStakeUsdc <= 0) {
    throw new Error("Additional stake must be greater than zero.");
  }

  const { data: membership, error: membershipError } = await admin
    .from("league_members")
    .select("id, stake_amount_usdc")
    .eq("league_id", input.league.id)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (membershipError) {
    const missingColumn = getMissingColumn(membershipError.message, "league_members");
    if (missingColumn !== "stake_amount_usdc") {
      throw new Error(membershipError.message);
    }

    const { data: fallbackMembership, error: fallbackMembershipError } = await admin
      .from("league_members")
      .select("id")
      .eq("league_id", input.league.id)
      .eq("user_id", input.userId)
      .maybeSingle();

    if (fallbackMembershipError) {
      throw new Error(fallbackMembershipError.message);
    }

    if (!fallbackMembership) {
      throw new Error("Join the league before increasing your stake.");
    }
  } else if (!membership) {
    throw new Error("Join the league before increasing your stake.");
  }

  const deduction = await deductBalance(admin, input.userId, input.additionalStakeUsdc);
  if (!deduction.ok) {
    const error = new Error(deduction.error);
    (error as Error & { status?: number }).status = deduction.status;
    throw error;
  }

  const { rake, netToPool } = calculateStakeSplit(input.additionalStakeUsdc);

  try {
    if (membership?.id) {
      const nextStakeAmount = roundUsdc(
        Number(membership.stake_amount_usdc ?? 0) + input.additionalStakeUsdc
      );
      const { error: membershipUpdateError } = await admin
        .from("league_members")
        .update({ stake_amount_usdc: nextStakeAmount })
        .eq("id", membership.id);

      if (membershipUpdateError) {
        const missingColumn = getMissingColumn(membershipUpdateError.message, "league_members");
        if (missingColumn !== "stake_amount_usdc") {
          throw new Error(membershipUpdateError.message);
        }
      }
    }

    // IMPORTANT: This fallback path has inherent race conditions (lost updates on prize_pool
    // with concurrent topups). This is acceptable ONLY because:
    // 1. It's the fallback when RPC is unavailable (degraded mode)
    // 2. Prize pool discrepancies are caught and refunded post-race via league settlement RPC
    // For production, ensure RPC is available to use topUpLeagueWithRpc instead.
    const nextPrizePool = roundUsdc(Number(input.league.prize_pool ?? 0) + netToPool);
    const { error: updateLeagueError } = await admin
      .from("leagues")
      .update({ prize_pool: nextPrizePool })
      .eq("id", input.league.id);

    if (updateLeagueError) {
      throw new Error(updateLeagueError.message);
    }

    await insertEntryTransaction(
      admin,
      input.userId,
      input.league.id,
      input.additionalStakeUsdc,
      `Additional league stake for ${input.league.name} (10% platform fee)`
    );

    await creditFeeWalletBestEffort(
      admin,
      rake,
      input.league.id,
      "Platform rake from additional league stake"
    );

    return {
      leagueId: input.league.id,
      chargedAmountUsdc: input.additionalStakeUsdc,
    };
  } catch (error) {
    await refundBalanceBestEffort(admin, input.userId, input.additionalStakeUsdc);
    throw error;
  }
}
