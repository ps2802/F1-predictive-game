"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { drivers, races } from "@/lib/races";

type PodiumPrediction = {
  first: string;
  second: string;
  third: string;
};

const emptyPrediction: PodiumPrediction = {
  first: "",
  second: "",
  third: "",
};

export default function PredictRacePage() {
  const { raceId } = useParams<{ raceId: string }>();
  const race = useMemo(() => races.find((item) => item.id === raceId), [raceId]);
  const [prediction, setPrediction] = useState<PodiumPrediction>(emptyPrediction);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!prediction.first || !prediction.second || !prediction.third) {
      setMessage("Select drivers for all three positions.");
      return;
    }

    if (new Set([prediction.first, prediction.second, prediction.third]).size !== 3) {
      setMessage("Each podium position must be a different driver.");
      return;
    }

    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      setMessage("Supabase env vars missing. Prediction not submitted.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setMessage("You need to login before submitting predictions.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("predictions").upsert(
      {
        user_id: user.id,
        race_id: raceId,
        first_driver: prediction.first,
        second_driver: prediction.second,
        third_driver: prediction.third,
      },
      { onConflict: "user_id,race_id" },
    );

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Prediction saved.");
    setLoading(false);
  }

  if (!race) {
    return (
      <main>
        <section className="card stack">
          <h1>Race not found</h1>
          <Link className="button" href="/dashboard">
            Back to dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="card stack" style={{ maxWidth: 640 }}>
        <span className="badge">Round {race.round}</span>
        <h1>{race.name}</h1>
        <p className="small">
          {race.country} | {new Date(race.date).toLocaleDateString()}
        </p>

        <div className="stack">
          <label className="stack">
            <span>1st place</span>
            <select
              value={prediction.first}
              onChange={(event) => setPrediction((prev) => ({ ...prev, first: event.target.value }))}
            >
              <option value="">Select driver</option>
              {drivers.map((driver) => (
                <option key={`first-${driver}`} value={driver}>
                  {driver}
                </option>
              ))}
            </select>
          </label>

          <label className="stack">
            <span>2nd place</span>
            <select
              value={prediction.second}
              onChange={(event) => setPrediction((prev) => ({ ...prev, second: event.target.value }))}
            >
              <option value="">Select driver</option>
              {drivers.map((driver) => (
                <option key={`second-${driver}`} value={driver}>
                  {driver}
                </option>
              ))}
            </select>
          </label>

          <label className="stack">
            <span>3rd place</span>
            <select
              value={prediction.third}
              onChange={(event) => setPrediction((prev) => ({ ...prev, third: event.target.value }))}
            >
              <option value="">Select driver</option>
              {drivers.map((driver) => (
                <option key={`third-${driver}`} value={driver}>
                  {driver}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <button className="button" type="button" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save prediction"}
          </button>
          <Link className="button secondary" href="/dashboard">
            Cancel
          </Link>
        </div>

        {message ? <p className="small">{message}</p> : null}
      </section>
    </main>
  );
}
