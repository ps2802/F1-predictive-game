import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RaceRow = {
  id: string;
  round: number;
  name?: string | null;
  grand_prix_name?: string | null;
  qualifying_starts_at?: string | null;
  race_starts_at?: string | null;
  race_date?: string | null;
  season?: number | null;
};

export async function GET() {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured." },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();

  const { data: races, error } = await admin
    .from("races")
    .select("*")
    .order("round", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nextRace =
    ((races ?? []) as RaceRow[])
      .filter((race) => typeof race.season !== "number" || race.season === 2026)
      .find((race) => {
        const qualifyingStart = race.qualifying_starts_at;
        if (qualifyingStart) {
          return qualifyingStart > now;
        }

        return race.race_starts_at ? race.race_starts_at > now : false;
      }) ?? null;

  if (nextRace) {
    return NextResponse.json({
      race: {
        id: nextRace.id,
        round: nextRace.round,
        grand_prix_name: nextRace.grand_prix_name ?? nextRace.name ?? nextRace.id,
        qualifying_starts_at: nextRace.qualifying_starts_at ?? null,
        race_starts_at: nextRace.race_starts_at ?? null,
      },
    });
  }

  return NextResponse.json({ race: null });
}
