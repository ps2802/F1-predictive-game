import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppNav } from "@/app/components/AppNav";
import { PastRaceCard } from "./PastRaceCard";
import { buildPastRacesList, type PastRaceData } from "@/lib/pastRaces";
import type { PredictionVersionRow } from "@/lib/predictions";

export const metadata = {
  title: "Past Races | Gridlock",
  description: "Review your predictions and scores from past Formula 1 races.",
};

async function getPastRaces(): Promise<PastRaceData[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  const { data: scores } = await supabase
    .from("race_scores")
    .select("race_id, total_score, base_score, difficulty_score, edit_penalty, breakdown_json, calculated_at")
    .eq("user_id", user.id)
    .order("calculated_at", { ascending: false });

  const raceIds = (scores ?? []).map((score) => score.race_id);
  if (raceIds.length === 0) {
    return [];
  }

  const [
    { data: races },
    { data: predictions },
    { data: questions },
    { data: results },
  ] = await Promise.all([
    supabase
      .from("races")
      .select("id, round, name, country, race_date, race_starts_at")
      .in("id", raceIds)
      .order("round", { ascending: false }),
    supabase
      .from("predictions")
      .select("id, race_id")
      .eq("user_id", user.id)
      .in("race_id", raceIds),
    supabase
      .from("prediction_questions")
      .select("id, race_id, category, question_type, label, multi_select, display_order, options:prediction_options(id, option_value, display_order)")
      .in("race_id", raceIds)
      .order("display_order", { ascending: true }),
    supabase
      .from("race_results")
      .select("race_id, question_id, correct_option_id, pick_order")
      .in("race_id", raceIds),
  ]);

  const predictionIds = (predictions ?? []).map((prediction) => prediction.id);
  let predictionVersions: PredictionVersionRow[] = [];

  if (predictionIds.length > 0) {
    const { data: versions } = await supabase
      .from("prediction_versions")
      .select("id, prediction_id, version_number, answers_json, created_at")
      .in("prediction_id", predictionIds)
      .order("version_number", { ascending: false })
      .order("created_at", { ascending: false });

    predictionVersions = (versions ?? []).map((version) => ({
      id: version.id,
      prediction_id: version.prediction_id,
      version_number: version.version_number,
      answers_json: (version.answers_json ?? {}) as Record<string, string[]>,
      created_at: version.created_at,
    }));
  }

  return buildPastRacesList({
    races: races || [],
    scores: scores || [],
    predictions: predictions || [],
    predictionVersions,
    questions: questions || [],
    results: results || [],
  });
}

export default async function PastRacesPage() {
  let pastRaces: PastRaceData[] = [];
  let error = "";

  try {
    pastRaces = await getPastRaces();
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load past races";
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav />

      <div className="gla-content">
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/profile" style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.875rem", textDecoration: "none" }}>
            ← Profile
          </Link>
        </div>

        <h1 className="gla-page-title" style={{ marginBottom: "0.5rem" }}>
          Past Races
        </h1>
        <p className="gla-page-sub" style={{ marginBottom: "2rem" }}>
          Review your predictions and see how you performed.
        </p>

        {error && (
          <div style={{
            background: "rgba(225,6,0,0.15)",
            border: "1px solid rgba(225,6,0,0.3)",
            borderRadius: "8px",
            padding: "1rem",
            marginBottom: "2rem",
            color: "rgba(225,6,0,0.9)",
          }}>
            {error}
          </div>
        )}

        {pastRaces.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "3rem 1rem",
            color: "rgba(255,255,255,0.5)",
          }}>
            <p>No past races yet. Check back after the first race!</p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
            gap: "1.5rem",
          }}>
            {pastRaces.map((race) => (
              <PastRaceCard key={race.race_id} race={race} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
