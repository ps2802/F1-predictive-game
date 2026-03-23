import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { drivers } from "@/lib/races";

type PredictionPayload = {
  raceId?: string;
  firstDriver?: string;
  secondDriver?: string;
  thirdDriver?: string;
};

const VALID_DRIVERS = new Set(drivers);

export async function POST(request: Request): Promise<NextResponse> {
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

  // Validate all three drivers against the canonical allowlist.
  for (const driver of [firstDriver, secondDriver, thirdDriver]) {
    if (!VALID_DRIVERS.has(driver)) {
      return NextResponse.json({ error: `Unknown driver: ${driver}` }, { status: 400 });
    }
  }

  const { data: race, error: raceError } = await supabase
    .from("races")
    .select("is_locked, race_date")
    .eq("id", raceId)
    .single();

  if (raceError || !race) {
    return NextResponse.json({ error: "Race not found." }, { status: 404 });
  }

  // is_locked is the authoritative admin gate. Time-based lock is the automatic fallback.
  if (race.is_locked) {
    return NextResponse.json({ error: "Predictions locked." }, { status: 403 });
  }

  const raceStart = new Date(race.race_date).getTime();
  if (Number.isNaN(raceStart)) {
    return NextResponse.json({ error: "Invalid race date." }, { status: 500 });
  }

  if (Date.now() > raceStart) {
    return NextResponse.json({ error: "Predictions locked." }, { status: 403 });
  }

  // Block predictions for races that have already been settled.
  const { data: existingResult } = await supabase
    .from("results")
    .select("race_id")
    .eq("race_id", raceId)
    .maybeSingle();

  if (existingResult) {
    return NextResponse.json({ error: "Race already settled." }, { status: 403 });
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
