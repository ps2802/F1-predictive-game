import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

type JolpicaRace = {
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

type RaceInsertMinimal = {
  id: string;
  name: string;
  race_date: string;
};

type RaceInsertExtended = RaceInsertMinimal & {
  round: number;
  country: string;
  is_locked: boolean;
};

const JOLPICA_ENDPOINT = "https://api.jolpi.ca/ergast/f1/2026/races.json";

function slugifyCountry(country: string): string {
  return country
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toRaceTimestamp(date: string, time?: string): string {
  if (time && time.length > 0) {
    return `${date}T${time}`;
  }

  return `${date}T00:00:00Z`;
}

function buildRaceRows(races: JolpicaRace[]) {
  const idCounts = new Map<string, number>();

  return races.map((race) => {
    const country = race.Circuit.Location.country;
    const baseId = `${slugifyCountry(country)}-2026`;
    const nextCount = (idCounts.get(baseId) ?? 0) + 1;
    idCounts.set(baseId, nextCount);

    const id = nextCount === 1 ? baseId : `${baseId}-${nextCount}`;

    return {
      id,
      name: race.raceName,
      race_date: toRaceTimestamp(race.date, race.time),
      round: Number(race.round),
      country,
      is_locked: false,
    } satisfies RaceInsertExtended;
  });
}

async function fetchCalendar(): Promise<RaceInsertExtended[]> {
  const response = await fetch(JOLPICA_ENDPOINT);

  if (!response.ok) {
    throw new Error(`Failed to fetch 2026 calendar: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    MRData?: {
      RaceTable?: {
        Races?: JolpicaRace[];
      };
    };
  };

  const races = payload.MRData?.RaceTable?.Races ?? [];

  if (races.length === 0) {
    throw new Error("2026 calendar API returned zero races.");
  }

  return buildRaceRows(races);
}

async function insertMissingRaces(supabaseUrl: string, serviceKey: string) {
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const raceRows = await fetchCalendar();
  const ids = raceRows.map((race) => race.id);

  const { data: existingRows, error: selectError } = await supabase
    .from("races")
    .select("id")
    .in("id", ids);

  if (selectError) {
    throw new Error(`Failed checking existing races: ${selectError.message}`);
  }

  const existingIdSet = new Set((existingRows ?? []).map((row) => row.id as string));
  const missingExtended = raceRows.filter((race) => !existingIdSet.has(race.id));

  if (missingExtended.length === 0) {
    console.log("No new races to insert. All 2026 races already exist.");
    return;
  }

  const missingMinimal: RaceInsertMinimal[] = missingExtended.map(({ id, name, race_date }) => ({
    id,
    name,
    race_date,
  }));

  // Try minimal schema first (id, name, race_date), then retry with extended columns
  // for installations where races includes round/country/is_locked.
  let insertError: { message: string } | null = null;

  const minimalInsert = await supabase.from("races").insert(missingMinimal);
  if (!minimalInsert.error) {
    console.log(`Inserted ${missingMinimal.length} 2026 races.`);
    return;
  }

  insertError = minimalInsert.error;

  const shouldRetryExtended =
    insertError.message.includes('null value in column "round"') ||
    insertError.message.includes('null value in column "country"');

  if (!shouldRetryExtended) {
    throw new Error(`Failed inserting races: ${insertError.message}`);
  }

  const extendedInsert = await supabase.from("races").insert(missingExtended);

  if (extendedInsert.error) {
    throw new Error(`Failed inserting races with extended schema: ${extendedInsert.error.message}`);
  }

  console.log(`Inserted ${missingExtended.length} 2026 races.`);
}

async function main() {
  loadEnv({ path: ".env.local" });
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  }

  if (!serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  await insertMissingRaces(supabaseUrl, serviceKey);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`seed:races failed: ${message}`);
  process.exit(1);
});
