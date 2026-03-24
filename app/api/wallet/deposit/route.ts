import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DepositBody = z.object({
  target_user_id: z.string().uuid(),
  amount: z.number().positive().max(100_000),
  tx_hash: z.string().optional(),
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
  });
}

// Manually credit balance (admin/testing) — in production this is triggered by Helius webhook
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

  const parsed = DepositBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 });

  const { target_user_id, amount, tx_hash } = parsed.data;

  // Record deposit event
  const { error: depErr } = await supabase.from("deposit_events").insert({
    wallet_address: "manual",
    tx_hash: tx_hash ?? `manual_${Date.now()}`,
    amount,
    token: "USDC",
    confirmed: true,
    user_id: target_user_id,
  });

  if (depErr)
    return NextResponse.json({ error: depErr.message }, { status: 400 });

  // Credit balance
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("balance_usdc")
    .eq("id", target_user_id)
    .single();

  await supabase
    .from("profiles")
    .update({ balance_usdc: (targetProfile?.balance_usdc ?? 0) + amount })
    .eq("id", target_user_id);

  await supabase.from("transactions").insert({
    user_id: target_user_id,
    type: "deposit",
    amount,
    description: "Manual USDC credit",
  });

  return NextResponse.json({ success: true });
}
