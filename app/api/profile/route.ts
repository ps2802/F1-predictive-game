import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import {
  buildProfileRaceHistory,
  type ProfilePrediction,
  type ProfileRaceScore,
} from "@/lib/profileHistory";
import type { PredictionVersionRow } from "@/lib/predictions";

export async function GET(_request: NextRequest) {
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

export async function PATCH(request: NextRequest) {
  // Rate limit: 20 profile updates per IP per hour
  const ip = getClientIp(request.headers);
  if (await isRateLimited(`profile-patch:${ip}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

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

  // Only allow https:// avatar URLs — blocks javascript: and data: URI XSS vectors
  if (avatar_url !== undefined) {
    if (avatar_url.length > 2048 || !/^https:\/\//i.test(avatar_url)) {
      return NextResponse.json(
        { error: "avatar_url must be a valid https URL." },
        { status: 400 }
      );
    }
  }

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
