import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// USDC mint address on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type TokenTransfer = {
  fromUserAccount: string;
  toUserAccount: string;
  mint: string;
  tokenAmount: number;
};

type HeliusTransaction = {
  signature: string;
  type: string;
  tokenTransfers?: TokenTransfer[];
};

/**
 * POST /api/webhooks/helius
 *
 * Receives Enhanced Transaction webhooks from Helius when USDC transfers
 * land in any watched wallet address. Matches the destination address to
 * a user profile and credits their in-game USDC balance automatically.
 *
 * Security: verifies Authorization header matches HELIUS_WEBHOOK_SECRET.
 * Register this URL in the Helius dashboard with authHeader set to the
 * value of HELIUS_WEBHOOK_SECRET (Vercel env var).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  // Use timing-safe comparison to prevent secret oracle attacks
  const authValid =
    authHeader.length === secret.length &&
    timingSafeEqual(Buffer.from(authHeader), Buffer.from(secret));
  if (!authValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "DB not configured." }, { status: 503 });
  }

  let transactions: HeliusTransaction[];
  try {
    transactions = await request.json();
    if (!Array.isArray(transactions)) {
      return NextResponse.json({ error: "Expected array." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const credited: string[] = [];
  const skipped: string[] = [];
  const errors: { sig: string; error: string }[] = [];

  for (const tx of transactions) {
    const usdcTransfers = (tx.tokenTransfers ?? []).filter(
      (t) => t.mint === USDC_MINT && t.tokenAmount > 0
    );

    for (const transfer of usdcTransfers) {
      const toAddress = transfer.toUserAccount;
      if (!toAddress) continue;

      // Look up user by their wallet address
      const { data: profile, error: lookupErr } = await admin
        .from("profiles")
        .select("id")
        .eq("wallet_address", toAddress)
        .maybeSingle();

      if (lookupErr || !profile) {
        skipped.push(tx.signature);
        continue;
      }

      // Record the deposit — idempotent: tx_hash unique constraint prevents double-credits
      const { error: depositErr } = await admin.rpc("record_normalized_deposit", {
        p_target_user_id: profile.id,
        p_wallet_address: toAddress,
        p_tx_hash: tx.signature,
        p_source_amount: transfer.tokenAmount,
        p_source_token: "USDC",
        p_swapped_amount_usdc: transfer.tokenAmount,
        p_credited_amount_usdc: transfer.tokenAmount,
        p_fee_amount_usdc: 0,
        p_swap_reference: null,
        p_description: "USDC deposit via Helius webhook",
      });

      if (depositErr) {
        // Unique constraint violation = already processed, safe to ignore
        if (depositErr.message.includes("unique") || depositErr.message.includes("duplicate")) {
          skipped.push(tx.signature);
        } else {
          errors.push({ sig: tx.signature, error: depositErr.message });
        }
      } else {
        credited.push(tx.signature);
      }
    }
  }

  return NextResponse.json({ credited, skipped, errors });
}
