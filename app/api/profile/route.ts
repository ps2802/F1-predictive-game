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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, balance_usdc, is_admin, created_at")
    .eq("id", user.id)
    .single();

  const { data: scores } = await supabase
    .from("race_scores")
    .select("race_id, total_score, calculated_at")
    .eq("user_id", user.id)
    .order("calculated_at", { ascending: false });

  const totalScore = (scores ?? []).reduce((sum, s) => sum + (s.total_score ?? 0), 0);

  return NextResponse.json({
    profile: { ...profile, email: user.email },
    totalScore,
    raceScores: scores ?? [],
  });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, avatar_url } = (await request.json()) as {
    username?: string;
    avatar_url?: string;
  };

  if (username !== undefined && (username.length < 2 || username.length > 30))
    return NextResponse.json(
      { error: "Username must be 2–30 characters." },
      { status: 400 }
    );

  const updates: Record<string, string> = {};
  if (username !== undefined) updates.username = username.trim();
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
