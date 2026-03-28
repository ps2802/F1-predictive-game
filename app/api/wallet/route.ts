import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type WalletTransactionRow = {
  id: string;
  type: "deposit" | "entry_fee" | "edit_fee" | "withdrawal" | "payout" | "refund";
  amount: number | string;
  currency: string;
  description: string | null;
  created_at: string;
};

type DepositEventRow = {
  id: string;
  tx_hash: string;
  token: string;
  amount: number | string;
  swapped_amount_usdc: number | string;
  credited_amount_usdc: number | string;
  fee_amount_usdc: number | string;
  confirmed: boolean;
  created_at: string;
};

type WithdrawalHoldRow = {
  id: string;
  amount: number | string;
  reason: string;
  available_at: string;
  released: boolean;
  created_at: string;
};

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export async function GET() {
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

  const [profileResult, transactionsResult, depositsResult, holdsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, balance_usdc, is_admin, wallet_address")
      .eq("id", user.id)
      .single(),
    supabase
      .from("transactions")
      .select("id, type, amount, currency, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("deposit_events")
      .select(
        "id, tx_hash, token, amount, swapped_amount_usdc, credited_amount_usdc, fee_amount_usdc, confirmed, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("withdrawal_holds")
      .select("id, amount, reason, available_at, released, created_at")
      .eq("user_id", user.id)
      .eq("released", false)
      .order("available_at", { ascending: true }),
  ]);

  if (profileResult.error) {
    return NextResponse.json({ error: profileResult.error.message }, { status: 400 });
  }

  if (transactionsResult.error) {
    return NextResponse.json({ error: transactionsResult.error.message }, { status: 400 });
  }

  if (depositsResult.error) {
    return NextResponse.json({ error: depositsResult.error.message }, { status: 400 });
  }

  if (holdsResult.error) {
    return NextResponse.json({ error: holdsResult.error.message }, { status: 400 });
  }

  const transactions = ((transactionsResult.data ?? []) as WalletTransactionRow[]).map(
    (transaction) => ({
      ...transaction,
      amount: toNumber(transaction.amount),
    })
  );

  const deposits = ((depositsResult.data ?? []) as DepositEventRow[]).map((deposit) => ({
    ...deposit,
    amount: toNumber(deposit.amount),
    swapped_amount_usdc: toNumber(deposit.swapped_amount_usdc),
    credited_amount_usdc: toNumber(deposit.credited_amount_usdc),
    fee_amount_usdc: toNumber(deposit.fee_amount_usdc),
  }));

  const withdrawalHolds = ((holdsResult.data ?? []) as WithdrawalHoldRow[]).map((hold) => ({
    ...hold,
    amount: toNumber(hold.amount),
  }));

  return NextResponse.json({
    profile: {
      username: profileResult.data?.username ?? null,
      balance_usdc: toNumber(profileResult.data?.balance_usdc),
      is_admin: profileResult.data?.is_admin ?? false,
      wallet_address: profileResult.data?.wallet_address ?? null,
    },
    ledger_currency: "USDC",
    transactions,
    deposits,
    withdrawalHolds,
    summary: {
      availableBalanceUsdc: toNumber(profileResult.data?.balance_usdc),
      pendingWithdrawalUsdc: withdrawalHolds.reduce((sum, hold) => sum + hold.amount, 0),
      depositedUsdc: deposits.reduce((sum, deposit) => sum + deposit.credited_amount_usdc, 0),
    },
  });
}
