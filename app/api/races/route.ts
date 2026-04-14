import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRacePresentationMeta } from "@/lib/dashboard";

type RaceRow = {
  id: string;
  round: number;
  race_starts_at?: string | null;
  qualifying_starts_at?: string | null;
  grand_prix_name?: string | null;
  season?: number | null;
  race_locked?: boolean | null;
  quali_locked?: boolean | null;
};

export async function GET() {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured." },
      { status: 500 }
    );
  }

  const now = new Date();

  const { data: races, error } = await admin
    .from("races")
    .select("*")
    .order("round", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seasonScopedRaces = ((races ?? []) as RaceRow[]).filter((race) => {
    if (typeof race.season !== "number") {
      return true;
    }
    return race.season === 2026;
  });

  const mappedRaces = seasonScopedRaces.map((race) => {
    const presentation = getRacePresentationMeta(race.id);
    const qualifyingStart = race.qualifying_starts_at
      ? new Date(race.qualifying_starts_at)
      : null;
    const isClosed =
      race.race_locked === true ||
      race.quali_locked === true ||
      (qualifyingStart !== null && now >= qualifyingStart);

    return {
      id: race.id,
      round: race.round,
      name: race.grand_prix_name ?? presentation?.name ?? race.id,
      country: presentation?.country ?? null,
      flag: presentation?.flag ?? null,
      date: race.race_starts_at?.slice(0, 10) ?? null,
      qualifying_starts_at: race.qualifying_starts_at,
      race_starts_at: race.race_starts_at,
      status: isClosed ? "closed" : "upcoming",
      race_locked: race.race_locked === true,
    };
  });

  const nextRace = mappedRaces.find((race) => race.status === "upcoming") ?? null;
  let driverCount: number | null = null;

  if (nextRace) {
    const { data: questions } = await admin
      .from("prediction_questions")
      .select("id")
      .eq("race_id", nextRace.id);

    const questionIds = (questions ?? []).map((question) => question.id);

    if (questionIds.length > 0) {
      const { data: options } = await admin
        .from("prediction_options")
        .select("option_value")
        .eq("option_type", "driver")
        .in("question_id", questionIds);

      driverCount = new Set(
        (options ?? []).map((option) => option.option_value)
      ).size;
    }
  }

  return NextResponse.json({
    races: mappedRaces,
    meta: {
      totalRounds: mappedRaces.length,
      driverCount,
    },
  });
}
