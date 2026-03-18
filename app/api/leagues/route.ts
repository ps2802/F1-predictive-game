import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Return public leagues + leagues the user is a member of
  const { data: leagues, error } = await supabase
    .from("leagues")
    .select("*, member_count")
    .or(`type.eq.public,creator_id.eq.${user.id}`)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // Get leagues user has joined
  const { data: memberships } = await supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", user.id);

  const joinedIds = new Set((memberships ?? []).map((m) => m.league_id));

  return NextResponse.json({
    leagues: (leagues ?? []).map((l) => ({
      ...l,
      is_member: joinedIds.has(l.id),
    })),
  });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, type, entry_fee_usdc, max_users } = (await request.json()) as {
    name: string;
    type: "public" | "private";
    entry_fee_usdc: number;
    max_users: number;
  };

  if (!name?.trim())
    return NextResponse.json({ error: "League name is required." }, { status: 400 });

  // Generate invite code
  const { data: codeData } = await supabase.rpc("generate_invite_code");
  const inviteCode = (codeData as string) ?? Math.random().toString(36).slice(2, 10).toUpperCase();

  const { data: league, error } = await supabase
    .from("leagues")
    .insert({
      name: name.trim(),
      type: type ?? "private",
      invite_code: inviteCode,
      creator_id: user.id,
      entry_fee_usdc: entry_fee_usdc ?? 0,
      max_users: max_users ?? 1000,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  // Auto-join creator
  await supabase.from("league_members").insert({
    league_id: league.id,
    user_id: user.id,
    paid: true,
  });

  await supabase
    .from("leagues")
    .update({ member_count: 1 })
    .eq("id", league.id);

  return NextResponse.json({ league }, { status: 201 });
}
