import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { races } from "../lib/races";

loadEnv({ path: ".env.local" });
loadEnv();

type RaceRow = {
  id: string;
  season: number;
  round: number;
  name: string;
  grand_prix_name: string;
  country: string;
  race_date: string;
  is_locked: boolean;
  race_locked: boolean;
};

function buildRaceRows(): RaceRow[] {
  return races.map((race) => ({
    id: race.id,
    season: 2026,
    round: race.round,
    name: race.name,
    grand_prix_name: race.name,
    country: race.country,
    race_date: race.date,
    is_locked: race.status === "closed",
    race_locked: race.status === "closed",
  }));
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
  const raceRows = buildRaceRows();

  const { error } = await supabase.from("races").upsert(raceRows, {
    onConflict: "id",
  });

  if (error) {
    throw new Error(`Failed upserting races: ${error.message}`);
  }

  console.log(`seed:races success: upserted ${raceRows.length} races`);
}

main().catch((error) => {
  console.error("seed:races failed:", error.message);
  process.exit(1);
});
