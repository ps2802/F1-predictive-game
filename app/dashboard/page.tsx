"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { races } from "@/lib/races";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppNav } from "@/app/components/AppNav";

type UserProfile = {
  username: string | null;
  balance_usdc: number;
  is_admin: boolean;
};

type DbRace = {
  id: string;
  race_locked: boolean;
  qualifying_starts_at: string | null;
};

type RaceScore = {
  race_id: string;
  total_score: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lockedRaceIds, setLockedRaceIds] = useState<Set<string>>(new Set());
  const [settledScores, setSettledScores] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function loadData() {
    setLoadError("");
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const [profileResult, racesResult, scoresResult] = await Promise.all([
      supabase.from("profiles").select("username, balance_usdc, is_admin").eq("id", user.id).maybeSingle(),
      supabase.from("races").select("id, race_locked, qualifying_starts_at"),
      supabase.from("race_scores").select("race_id, total_score").eq("user_id", user.id),
    ]);

    // Only treat a hard races query error as fatal; missing profile is acceptable (new user)
    if (racesResult.error) {
      setLoadError("Couldn't load the race calendar. Please try again.");
      setLoading(false);
      return;
    }

    setProfile(profileResult.data ?? null);

    const now = new Date();
    const locked = new Set<string>();
    for (const r of (racesResult.data ?? []) as DbRace[]) {
      const pastDeadline = r.qualifying_starts_at != null && now >= new Date(r.qualifying_starts_at);
      if (r.race_locked || pastDeadline) locked.add(r.id);
    }
    setLockedRaceIds(locked);

    const scoresMap = new Map<string, number>();
    for (const s of (scoresResult.data ?? []) as RaceScore[]) {
      scoresMap.set(s.race_id, s.total_score);
    }
    setSettledScores(scoresMap);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav profile={profile} />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <h1 className="gla-page-title">Something went wrong</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>{loadError}</p>
          <button
            className="gla-race-btn"
            style={{ marginTop: "2rem" }}
            onClick={loadData}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={profile} />

      <div className="gla-content">
        <div className="dash-header">
          <div>
            <p className="gla-page-title">2026 Season</p>
            <p className="gla-page-sub">
              {races.length} rounds · select a race to make your predictions
            </p>
          </div>
        </div>

        {races.length === 0 ? (
          <div className="lb-empty" style={{ marginTop: "3rem" }}>
            <p className="lb-empty-headline">No races on the calendar yet.</p>
            <p className="lb-empty-sub">Check back soon.</p>
          </div>
        ) : null}

        <div className="gla-race-grid">
          {races.map((race) => {
            // A race is locked if: DB says so, OR hardcoded status is "closed" (fallback for races not yet in DB)
            const isClosed = lockedRaceIds.has(race.id) || race.status === "closed";
            const hasScore = settledScores.has(race.id);
            const score = settledScores.get(race.id);
            return (
              <article className="gla-race-card" key={race.id}>
                <p className="gla-race-round">Round {race.round}</p>
                <h2 className="gla-race-name">{race.name}</h2>
                <p className="gla-race-meta">
                  {race.country}
                  <span className="gla-race-sep" />
                  {new Date(race.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                {hasScore ? (
                  /* Post-race: show settled score notification */
                  <>
                    <span className="gla-race-status" style={{ background: "rgba(0,210,170,0.12)", color: "rgba(0,210,170,1)", border: "1px solid rgba(0,210,170,0.25)", borderRadius: "6px", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "0.2rem 0.55rem" }}>
                      Results In
                    </span>
                    <div style={{ marginTop: "auto" }}>
                      <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.38)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
                        Your score
                      </div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#fff", lineHeight: 1, marginBottom: "0.75rem" }}>
                        {Number(score).toFixed(1)}
                      </div>
                      <Link className="gla-race-btn" href={`/scores/${race.id}`} style={{ fontSize: "0.75rem" }}>
                        See breakdown →
                      </Link>
                    </div>
                  </>
                ) : isClosed ? (
                  <>
                    <span className={`gla-race-status is-closed`}>
                      Locked
                    </span>
                    <span className="gla-race-btn is-disabled">Locked</span>
                  </>
                ) : (
                  <>
                    <span className={`gla-race-status is-upcoming`}>
                      Open
                    </span>
                    <Link className="gla-race-btn" href={`/predict/${race.id}`}>
                      Predict
                    </Link>
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

