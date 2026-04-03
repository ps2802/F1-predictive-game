import { NextResponse } from "next/server";
import { fetchSeasonSchedule } from "@/lib/jolpica";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function parseSeason(request: Request): number {
  const { searchParams } = new URL(request.url);
  const season = Number(searchParams.get("season") ?? "2026");

  if (!Number.isInteger(season) || season < 1950 || season > 2100) {
    throw new Error("Invalid season.");
  }

  return season;
}

export async function GET(request: Request) {
  let season: number;

  try {
    season = parseSeason(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid season." },
      { status: 400 }
    );
  }

  try {
    const races = await fetchSeasonSchedule(season, { cache: "no-store" });
    return NextResponse.json({
      season,
      totalRounds: races.length,
      source: "jolpica",
    });
  } catch (jolpicaError) {
    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Unable to load season summary." },
        { status: 503 }
      );
    }

    const { count, error } = await admin
      .from("races")
      .select("id", { count: "exact", head: true })
      .eq("season", season);

    if (error || typeof count !== "number") {
      return NextResponse.json(
        { error: "Unable to load season summary." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      season,
      totalRounds: count,
      source: "supabase",
      fallback: true,
      warning:
        jolpicaError instanceof Error ? jolpicaError.message : "Jolpica unavailable.",
    });
  }
}
