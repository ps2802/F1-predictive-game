import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

const WithdrawBody = z.object({
  amount_usdc: z.number().positive().max(100_000),
  destination_address: z.string().min(32).max(44),
});

export async function POST(request: NextRequest) {
  // Rate limit: 5 withdrawal attempts per IP per 10 minutes
  const ip = getClientIp(request.headers);
  if (await isRateLimited(`withdraw:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = WithdrawBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const { amount_usdc, destination_address } = parsed.data;

  // Check available balance
  const { data: profile } = await supabase
    .from("profiles")
    .select("balance_usdc")
    .eq("id", user.id)
    .single();

  if (!profile)
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  if (Number(profile.balance_usdc) < amount_usdc)
    return NextResponse.json({ error: "Insufficient balance." }, { status: 402 });

  // Deduct balance atomically
  const { error: deductErr } = await supabase.rpc("atomic_deduct_balance", {
    p_user_id: user.id,
    p_amount: amount_usdc,
  });

  if (deductErr)
    return NextResponse.json({ error: deductErr.message }, { status: 400 });

  // Record withdrawal transaction
  const { error: txErr } = await supabase.from("transactions").insert({
    user_id: user.id,
    type: "withdrawal",
    amount: -amount_usdc,
    currency: "USDC",
    description: `Withdrawal to ${destination_address.slice(0, 8)}...${destination_address.slice(-4)}`,
  });

  if (txErr)
    return NextResponse.json({ error: txErr.message }, { status: 400 });

  // Record payout hold with 24h admin review window
  const availableAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: holdErr } = await supabase.from("payout_holds").insert({
    user_id: user.id,
    amount: amount_usdc,
    reason: "withdrawal_review",
    destination_address,
    available_at: availableAt,
    released: false,
  });

  if (holdErr)
    return NextResponse.json({ error: holdErr.message }, { status: 400 });

  // Return masked address — the full address is stored in payout_holds, not needed by the client
  const maskedAddress = `${destination_address.slice(0, 8)}...${destination_address.slice(-4)}`;

  return NextResponse.json({
    success: true,
    amount_usdc,
    destination_address: maskedAddress,
    available_at: availableAt,
    message: "Withdrawal queued. Admin review within 24 hours.",
  });
}
