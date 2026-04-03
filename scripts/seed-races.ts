import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { buildRaceSeedRows, fetchSeasonSchedule } from "../lib/jolpica";

loadEnv({ path: ".env.local" });
loadEnv();

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
  const seasonRaces = await fetchSeasonSchedule(2026);
  const raceRows = buildRaceSeedRows(seasonRaces);

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
