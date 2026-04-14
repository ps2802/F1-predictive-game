import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { trackServer } from "@/lib/analytics.server";

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

  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  const parsed = WithdrawBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  const { amount_usdc, destination_address } = parsed.data;

  // Check available balance
  const { data: profile } = await admin
    .from("profiles")
    .select("balance_usdc")
    .eq("id", user.id)
    .single();

  if (!profile)
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  if (Number(profile.balance_usdc) < amount_usdc)
    return NextResponse.json({ error: "Insufficient balance." }, { status: 402 });

  // Deduct balance atomically
  const { error: deductErr } = await admin.rpc("atomic_deduct_balance", {
    p_user_id: user.id,
    p_amount: amount_usdc,
  });

  if (deductErr)
    return NextResponse.json({ error: deductErr.message }, { status: 400 });

  // Record withdrawal transaction
  const maskedAddress = `${destination_address.slice(0, 8)}...${destination_address.slice(-4)}`;
  const txPayload = {
    user_id: user.id,
    type: "withdrawal" as const,
    amount: -amount_usdc,
    currency: "USDC",
    description: `Withdrawal to ${maskedAddress}`,
  };
  const { data: insertedTx, error: txErr } = await admin
    .from("transactions")
    .insert(txPayload)
    .select("id")
    .single();

  if (txErr) {
    await admin.rpc("credit_user_balance", {
      p_user_id: user.id,
      p_amount: amount_usdc,
    });
    return NextResponse.json({ error: txErr.message }, { status: 400 });
  }

  // Record withdrawal hold with 24h admin review window
  const availableAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: holdErr } = await admin.from("withdrawal_holds").insert({
    user_id: user.id,
    amount: amount_usdc,
    reason: "withdrawal_review",
    destination_address,
    available_at: availableAt,
    released: false,
  });

  if (holdErr) {
    await admin.from("transactions").delete().eq("id", insertedTx.id);
    await admin.rpc("credit_user_balance", {
      p_user_id: user.id,
      p_amount: amount_usdc,
    });
    return NextResponse.json({ error: holdErr.message }, { status: 400 });
  }

  await trackServer(
    "withdrawal_requested",
    {
      amount_usdc,
      destination_address_present: true,
    },
    user.id
  );

  return NextResponse.json({
    success: true,
    amount_usdc,
    destination_address: maskedAddress,
    available_at: availableAt,
    message: "Withdrawal queued. Admin review within 24 hours.",
  });
}
