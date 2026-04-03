import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildFallbackNextRace } from "@/lib/races";

export async function GET() {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ race: buildFallbackNextRace() });
  }

  const now = new Date().toISOString();

  const { data: nextRace, error } = await admin
    .from("races")
    .select("id, round, grand_prix_name, qualifying_starts_at, race_starts_at")
    .eq("race_locked", false)
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
