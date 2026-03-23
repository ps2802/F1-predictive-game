import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv();

type JolpicaRace = {
  season: string;
  round: string;
  raceName: string;
  date: string;
  time?: string;
  Circuit: {
    Location: {
      country: string;
    };
  };
};

type JolpicaResponse = {
  MRData: {
    RaceTable: {
      Races: JolpicaRace[];
    };
  };
};

type RaceRow = {
  id: string;
  season: number;
  round: number;
  grand_prix_name: string;
  qualifying_starts_at: string;
  race_starts_at: string;
  status: string;
};

const JOLPICA_2026_URL = "https://api.jolpi.ca/ergast/f1/2026/races.json";

function slugifyCountry(country: string): string {
  return country
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toIsoTimestamp(date: string, time?: string): string {
  if (time && time.length > 0) {
    return `${date}T${time}`;
  }

  return `${date}T00:00:00Z`;
}

function buildRaceRows(races: JolpicaRace[]): RaceRow[] {
  const usedIds = new Map<string, number>();

  return races.map((race) => {
    const countrySlug = slugifyCountry(race.Circuit.Location.country);
    const baseId = `${countrySlug}-2026`;

    const seenCount = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, seenCount + 1);

    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`;
    const raceStartsAt = toIsoTimestamp(race.date, race.time);

    return {
      id,
      season: Number(race.season),
      round: Number(race.round),
      grand_prix_name: race.raceName,
      qualifying_starts_at: raceStartsAt,
      race_starts_at: raceStartsAt,
      status: "upcoming",
    };
  });
}

async function fetchCalendar(): Promise<JolpicaRace[]> {
  const response = await fetch(JOLPICA_2026_URL);

  if (!response.ok) {
    throw new Error(`Failed fetching Jolpica calendar: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as JolpicaResponse;
  const races = json?.MRData?.RaceTable?.Races ?? [];

  if (!Array.isArray(races) || races.length === 0) {
    throw new Error("No races returned from Jolpica.");
  }

  return races;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const races = await fetchCalendar();
  const raceRows = buildRaceRows(races);

  const { error } = await supabase
    .from("races")
    .upsert(raceRows, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed upserting races: ${error.message}`);
  }

  process.stdout.write(`seed:races: upserted ${raceRows.length} races\n`);
}

main().catch((error) => {
  console.error("seed:races failed:", error.message);
  process.exit(1);
});
