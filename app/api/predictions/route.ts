import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PredictionPayload = {
  raceId?: string;
  firstDriver?: string;
  secondDriver?: string;
  thirdDriver?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PredictionPayload;
  const { raceId, firstDriver, secondDriver, thirdDriver } = body;

  if (!raceId || !firstDriver || !secondDriver || !thirdDriver) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (new Set([firstDriver, secondDriver, thirdDriver]).size !== 3) {
    return NextResponse.json({ error: "Each podium position must be different." }, { status: 400 });
  }

  const { data: race, error: raceError } = await supabase
    .from("races")
    .select("race_starts_at")
    .eq("id", raceId)
    .single();

  if (raceError || !race) {
    return NextResponse.json({ error: "Race not found." }, { status: 404 });
  }

  const raceStart = new Date(race.race_starts_at).getTime();
  if (Number.isNaN(raceStart)) {
    return NextResponse.json({ error: "Invalid race date." }, { status: 500 });
  }

  if (Date.now() > raceStart) {
    return NextResponse.json({ error: "Predictions locked" }, { status: 403 });
  }

  const { error: upsertError } = await supabase.from("predictions").upsert(
    {
      user_id: user.id,
      race_id: raceId,
      first_driver: firstDriver,
      second_driver: secondDriver,
      third_driver: thirdDriver,
    },
    { onConflict: "user_id,race_id" },
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
