import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildProfileRaceHistory,
  type ProfilePrediction,
  type ProfileRaceScore,
} from "@/lib/profileHistory";
import type { PredictionVersionRow } from "@/lib/predictions";

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
    { data: predictions },
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
      .select("id, race_id")
      .eq("user_id", user.id),
  ]);

  const predictionIds = (predictions ?? []).map((prediction) => prediction.id);
  let predictionVersions: PredictionVersionRow[] = [];

  if (predictionIds.length > 0) {
    const { data: versions } = await supabase
      .from("prediction_versions")
      .select("id, prediction_id, version_number, answers_json, created_at")
      .in("prediction_id", predictionIds)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false });

    predictionVersions = (versions ?? []).map((version) => ({
      id: version.id,
      prediction_id: version.prediction_id,
      version_number: version.version_number,
      answers_json: (version.answers_json ?? {}) as Record<string, string[]>,
      created_at: version.created_at,
    }));
  }

  const raceScores = (scores ?? []) as ProfileRaceScore[];
  const userPredictions = (predictions ?? []) as ProfilePrediction[];
  const totalScore = raceScores.reduce((sum, score) => sum + (score.total_score ?? 0), 0);
  const raceHistory = buildProfileRaceHistory({
    scores: raceScores,
    predictions: userPredictions,
    predictionVersions,
  });

  return NextResponse.json({
    profile: { ...profile, email: user.email },
    totalScore,
    raceScores,
    raceHistory,
    predictionsCount: userPredictions.length,
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
