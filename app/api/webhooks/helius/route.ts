import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// USDC mint address — set HELIUS_USDC_MINT in env for devnet override.
// Mainnet-beta default: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
const USDC_MINT =
  process.env.HELIUS_USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const TokenTransferSchema = z.object({
  fromUserAccount: z.string(),
  toUserAccount: z.string(),
  mint: z.string(),
  tokenAmount: z.number(),
});

const HeliusTransactionSchema = z.object({
  signature: z.string(),
  tokenTransfers: z.array(TokenTransferSchema).optional().default([]),
  transactionError: z.unknown().nullable().optional(),
});

const HeliusPayloadSchema = z.array(HeliusTransactionSchema);

export async function POST(request: Request): Promise<NextResponse> {
  // Verify webhook secret — Helius sends this in the authorization header.
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = HeliusPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload shape." }, { status: 400 });
  }

  const results = await Promise.all(
    parsed.data.map((tx) => processTransaction(admin, tx))
  );

  const credited = results.filter(Boolean).length;
  return NextResponse.json({ received: parsed.data.length, credited });
}

interface HeliusTransaction {
  signature: string;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
  }>;
  transactionError?: unknown;
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function processTransaction(
  admin: AdminClient,
  tx: HeliusTransaction
): Promise<boolean> {
  // Skip failed transactions
  if (tx.transactionError != null) return false;

  const usdcTransfers = tx.tokenTransfers.filter((t) => t.mint === USDC_MINT);
  if (usdcTransfers.length === 0) return false;

  let anyCredited = false;

  for (const transfer of usdcTransfers) {
    const credited = await creditDeposit(admin, {
      txHash: tx.signature,
      walletAddress: transfer.toUserAccount,
      amount: transfer.tokenAmount,
    });
    if (credited) anyCredited = true;
  }

  return anyCredited;
}

async function creditDeposit(
  admin: AdminClient,
  params: { txHash: string; walletAddress: string; amount: number }
): Promise<boolean> {
  const { txHash, walletAddress, amount } = params;

  // Look up user by wallet address
  const { data: profile } = await admin
    .from("profiles")
    .select("id, balance_usdc")
    .eq("wallet_address", walletAddress)
    .single();

  if (!profile) return false; // wallet not registered in our system

  // Insert deposit event — tx_hash is UNIQUE so duplicate webhooks are safe.
  const { error: depErr } = await admin.from("deposit_events").insert({
    wallet_address: walletAddress,
    tx_hash: txHash,
    amount,
    token: "USDC",
    confirmed: true,
    user_id: profile.id,
  });

  // Conflict = already processed (Helius at-least-once delivery)
  if (depErr) return false;

  // Credit balance
  await admin
    .from("profiles")
    .update({ balance_usdc: (profile.balance_usdc ?? 0) + amount })
    .eq("id", profile.id);

  // Record in transaction ledger
  await admin.from("transactions").insert({
    user_id: profile.id,
    type: "deposit",
    amount,
    currency: "USDC",
    description: `On-chain USDC deposit — tx: ${txHash.slice(0, 12)}…`,
  });

  return true;
}
