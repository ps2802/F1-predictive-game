import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate limit: 10 join attempts per IP per minute (prevents invite code brute-force)
  const ip = getClientIp(request.headers);
  if (isRateLimited(`leagues-join:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invite_code } = (await request.json()) as { invite_code: string };
  if (!invite_code?.trim())
    return NextResponse.json({ error: "Invite code is required." }, { status: 400 });

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, entry_fee_usdc, member_count, max_users, is_active")
    .eq("invite_code", invite_code.trim().toUpperCase())
    .single();

  if (!league)
    return NextResponse.json({ error: "Invalid invite code." }, { status: 404 });

  if (!league.is_active)
    return NextResponse.json({ error: "This league is no longer active." }, { status: 400 });

  if (league.member_count >= league.max_users)
    return NextResponse.json({ error: "League is full." }, { status: 400 });

  // Check if already a member
  const { data: existing } = await supabase
    .from("league_members")
    .select("id")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .single();

  if (existing)
    return NextResponse.json({ error: "Already a member of this league." }, { status: 409 });

  // Check balance for paid leagues
  if (league.entry_fee_usdc > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance_usdc")
      .eq("id", user.id)
      .single();

    if (!profile || profile.balance_usdc < league.entry_fee_usdc)
      return NextResponse.json(
        { error: "Insufficient balance. Please deposit USDC first." },
        { status: 402 }
      );

    // Atomic deduction using optimistic locking.
    //
    // WHY: a simple read-then-write has a race condition: two simultaneous
    // requests both read balance=100, both pass the check, both deduct → user
    // spends 2x. By requiring balance_usdc to still equal the value we just
    // read, the second concurrent update finds 0 rows (balance changed between
    // read and write) and returns a 409. Only one of two racing requests wins.
    const { data: deducted } = await supabase
      .from("profiles")
      .update({ balance_usdc: profile.balance_usdc - league.entry_fee_usdc })
      .eq("id", user.id)
      .eq("balance_usdc", profile.balance_usdc) // optimistic lock
      .select("balance_usdc");

    if (!deducted || deducted.length === 0) {
      return NextResponse.json(
        { error: "Balance changed — please try again." },
        { status: 409 }
      );
    }

    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "entry_fee",
      amount: -league.entry_fee_usdc,
      reference_id: league.id,
      description: `Entry fee for league: ${league.name}`,
    });

    // Increment prize pool by entry fee
    await supabase.rpc("increment_prize_pool", {
      p_league_id: league.id,
      p_amount: league.entry_fee_usdc,
    }).then(() => {
      // rpc may not exist yet — safe fallback handled in hardening migration
    });
  }

  // For free leagues, paid=true immediately.
  // For paid leagues, payment was already deducted above — mark as paid.
  const { error: joinErr } = await supabase.from("league_members").insert({
    league_id: league.id,
    user_id: user.id,
    paid: true,
  });

  if (joinErr)
    return NextResponse.json({ error: joinErr.message }, { status: 400 });

  // Increment member count
  await supabase
    .from("leagues")
    .update({ member_count: league.member_count + 1 })
    .eq("id", league.id);

  // Activate any draft predictions now that user has a paid league membership.
  // If the RPC fails (e.g. function not yet deployed), we surface a warning
  // in the response rather than silently leaving predictions in draft state.
  const { data: activatedCount, error: activateErr } = await supabase.rpc(
    "activate_user_predictions",
    { p_user_id: user.id }
  );

  if (activateErr) {
    // Join succeeded and fee was paid — return partial success so the client
    // can show a clear warning. User should retry or contact support.
    return NextResponse.json({
      success: true,
      leagueId: league.id,
      activationWarning:
        "You've joined the league, but your draft predictions could not be activated automatically. Please refresh or contact support if they still show as Draft.",
    });
  }

  return NextResponse.json({
    success: true,
    leagueId: league.id,
    activatedCount: activatedCount ?? 0,
  });
}
