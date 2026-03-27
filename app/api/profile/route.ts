import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    { data: profile },
    { data: scores },
    { count: predictionsCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, avatar_url, balance_usdc, is_admin, created_at, wallet_address")
      .eq("id", user.id)
      .single(),
    supabase
      .from("race_scores")
      .select("race_id, total_score, calculated_at")
      .eq("user_id", user.id)
      .order("calculated_at", { ascending: false }),
    supabase
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const totalScore = (scores ?? []).reduce((sum, s) => sum + (s.total_score ?? 0), 0);

  return NextResponse.json({
    profile: { ...profile, email: user.email },
    totalScore,
    raceScores: scores ?? [],
    predictionsCount: predictionsCount ?? 0,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "Supabase admin client not configured." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { username, avatar_url } = (await request.json()) as {
    username?: string;
    avatar_url?: string;
  };

  const trimmedUsername = username?.trim();

  if (trimmedUsername !== undefined && (trimmedUsername.length < 2 || trimmedUsername.length > 30))
    return NextResponse.json(
      { error: "Username must be 2–30 characters." },
      { status: 400 }
    );

  const updates: Record<string, string> = {};
  if (trimmedUsername !== undefined) updates.username = trimmedUsername;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;

  const { error } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        ...updates,
      },
      { onConflict: "id" }
    );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
