import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeDepositInput } from "@/lib/wallet/deposits";

const DepositBody = z.object({
  target_user_id: z.string().uuid(),
  amount: z.number().positive().max(100_000).optional(),
  source_amount: z.number().positive().max(100_000).optional(),
  swapped_amount_usdc: z.number().positive().max(100_000).optional(),
  credited_amount_usdc: z.number().positive().max(100_000).optional(),
  fee_amount_usdc: z.number().min(0).max(100_000).optional().default(0),
  source_token: z.string().trim().min(1).max(24).optional().default("USDC"),
  tx_hash: z.string().optional(),
  wallet_address: z.string().optional(),
  swap_reference: z.string().optional(),
});

// Returns user's deposit wallet address + current balance
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_address, balance_usdc")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    wallet_address: profile?.wallet_address ?? null,
    balance_usdc: profile?.balance_usdc ?? 0,
    ledger_currency: "USDC",
  });
}

// Manually credit balance (admin/testing) — in production this is triggered by deposit detection
// after any supported asset is swapped into internal USDC balance.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, balance_usdc")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin)
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured." },
      { status: 503 }
    );
  }

  const parsed = DepositBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 });

  const {
    target_user_id,
    amount,
    source_amount,
    swapped_amount_usdc,
    credited_amount_usdc,
    fee_amount_usdc,
    source_token,
    tx_hash,
    wallet_address,
    swap_reference,
  } = parsed.data;

  let normalized;
  try {
    normalized = normalizeDepositInput({
      amount,
      source_amount,
      source_token,
      swapped_amount_usdc,
      credited_amount_usdc,
      fee_amount_usdc,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid deposit payload." },
      { status: 400 }
    );
  }

  const resolvedTxHash = tx_hash?.trim() || `manual_${crypto.randomUUID()}`;
  const { data: depositResult, error: depositErr } = await admin.rpc(
    "record_normalized_deposit",
    {
      p_target_user_id: target_user_id,
      p_wallet_address: wallet_address?.trim() || "manual",
      p_tx_hash: resolvedTxHash,
      p_source_amount: normalized.sourceAmount,
      p_source_token: normalized.sourceToken,
      p_swapped_amount_usdc: normalized.swappedAmountUsdc,
      p_credited_amount_usdc: normalized.creditedAmountUsdc,
      p_fee_amount_usdc: normalized.feeAmountUsdc,
      p_swap_reference: swap_reference?.trim() || null,
      p_description:
        normalized.sourceToken === "USDC" && normalized.feeAmountUsdc === 0
          ? "Manual USDC credit"
          : `Manual deposit credit after ${normalized.sourceToken} to USDC swap`,
    }
  );

  if (depositErr) {
    return NextResponse.json({ error: depositErr.message }, { status: 400 });
  }

  const resultRow = Array.isArray(depositResult) ? depositResult[0] : depositResult;
  if (!resultRow) {
    return NextResponse.json(
      { error: "Deposit could not be recorded." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    tx_hash: resolvedTxHash,
    deposit_event_id: resultRow.deposit_event_id,
    source_token: normalized.sourceToken,
    source_amount: normalized.sourceAmount,
    swapped_amount_usdc: normalized.swappedAmountUsdc,
    credited_amount_usdc: resultRow.credited_amount_usdc,
    fee_amount_usdc: resultRow.fee_amount_usdc,
  });
}
