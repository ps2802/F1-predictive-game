"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { drivers, races } from "@/lib/races";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function Navbar() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="gla-nav">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/gridlock logo - transparent.png"
        alt="Gridlock"
        className="gla-nav-logo"
        draggable={false}
      />
      <div className="gla-nav-right">
        <Link className="gla-nav-link" href="/dashboard">Dashboard</Link>
        <button className="gla-nav-link" onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}

type PodiumPrediction = { first: string; second: string; third: string };
const empty: PodiumPrediction = { first: "", second: "", third: "" };

export default function PredictRacePage() {
  const { raceId } = useParams<{ raceId: string }>();
  const race = useMemo(() => races.find((r) => r.id === raceId), [raceId]);
  const [prediction, setPrediction] = useState<PodiumPrediction>(empty);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const { first, second, third } = prediction;

    if (!first || !second || !third) {
      setMessage("Select a driver for all three positions.");
      setIsError(true);
      return;
    }

    if (new Set([first, second, third]).size !== 3) {
      setMessage("Each position must be a different driver.");
      setIsError(true);
      return;
    }

    setLoading(true);
    setMessage("");

    const response = await fetch("/api/predictions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raceId, firstDriver: first, secondDriver: second, thirdDriver: third }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setMessage(payload.error ?? "Failed to save prediction.");
      setIsError(true);
      setLoading(false);
      return;
    }

    setSaved(true);
    setMessage("");
    setIsError(false);
    setLoading(false);
  }

  if (!race) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <Navbar />
        <div className="gla-content gla-notfound">
          <p className="gla-page-title">Race not found</p>
          <Link className="gla-race-btn" href="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const positions: { key: keyof PodiumPrediction; label: string; num: string }[] = [
    { key: "first",  label: "1st place", num: "01" },
    { key: "second", label: "2nd place", num: "02" },
    { key: "third",  label: "3rd place", num: "03" },
  ];

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <Navbar />

      <div className="gla-content">
        <div className="gla-predict-header">
          <p className="gla-predict-round">Round {race.round} · Podium prediction</p>
          <h1 className="gla-predict-title">{race.name}</h1>
          <p className="gla-predict-meta">
            {race.country} ·{" "}
            {new Date(race.date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="gla-predict-form">
          {positions.map(({ key, label, num }) => (
            <div className="gla-predict-row" key={key}>
              <div className="gla-predict-pos">
                <span className="pos-num">{num}</span>
                {label}
              </div>
              <select
                className="gla-predict-select"
                value={prediction[key]}
                onChange={(e) =>
                  setPrediction((prev) => ({ ...prev, [key]: e.target.value }))
                }
              >
                <option value="">Select driver</option>
                {drivers.map((driver) => (
                  <option key={`${key}-${driver}`} value={driver}>
                    {driver}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="gla-predict-actions">
          {saved ? (
            <div className="gla-predict-saved">
              <span className="gla-predict-saved-dot" />
              Prediction saved
            </div>
          ) : (
            <button
              className="gla-predict-submit"
              type="button"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? <span className="gla-spinner" /> : null}
              {loading ? "Saving…" : "Lock in prediction"}
            </button>
          )}
          <Link className="gla-predict-cancel" href="/dashboard">
            Cancel
          </Link>
        </div>

        {message && (
          <p className={`gla-predict-msg ${isError ? "is-error" : "is-success"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
