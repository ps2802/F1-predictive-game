import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { races as fallbackRaces } from "@/lib/races";

function buildFallbackNextRace() {
  const now = new Date();
  const fallbackRace = fallbackRaces.find((race) => new Date(race.date) > now) ?? null;

  if (!fallbackRace) {
    return null;
  }

  return {
    id: fallbackRace.id,
    round: fallbackRace.round,
    grand_prix_name: fallbackRace.name,
    qualifying_starts_at: null,
    race_starts_at: `${fallbackRace.date}T00:00:00.000Z`,
  };
}

export async function GET() {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ race: buildFallbackNextRace() });
  }

  const now = new Date().toISOString();

  const { data: nextRace, error } = await admin
    .from("races")
    .select("id, round, grand_prix_name, qualifying_starts_at, race_starts_at")
    .not("qualifying_starts_at", "is", null)
    .gt("qualifying_starts_at", now)
    .order("qualifying_starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (nextRace) {
    return NextResponse.json({ race: nextRace });
  }

  const fallback = buildFallbackNextRace();
  return NextResponse.json({ race: fallback });
}
