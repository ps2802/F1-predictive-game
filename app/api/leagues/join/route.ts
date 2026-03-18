import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

    // Deduct entry fee
    await supabase
      .from("profiles")
      .update({ balance_usdc: profile.balance_usdc - league.entry_fee_usdc })
      .eq("id", user.id);

    await supabase.from("transactions").insert({
      user_id: user.id,
      type: "entry_fee",
      amount: -league.entry_fee_usdc,
      reference_id: league.id,
      description: `Entry fee for league: ${league.name}`,
    });

    // Add to prize pool
    await supabase
      .from("leagues")
      .update({ prize_pool: league.entry_fee_usdc }) // simplified — incremented by trigger ideally
      .eq("id", league.id);
  }

  const { error: joinErr } = await supabase.from("league_members").insert({
    league_id: league.id,
    user_id: user.id,
    paid: league.entry_fee_usdc === 0,
  });

  if (joinErr)
    return NextResponse.json({ error: joinErr.message }, { status: 400 });

  // Increment member count
  await supabase
    .from("leagues")
    .update({ member_count: league.member_count + 1 })
    .eq("id", league.id);

  return NextResponse.json({ success: true, leagueId: league.id });
}
