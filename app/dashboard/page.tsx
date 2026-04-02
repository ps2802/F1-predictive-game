"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { track } from "@/lib/analytics";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRaceCatalog } from "@/lib/raceCatalog";

type UserProfile = {
  username: string | null;
  balance_usdc: number;
  is_admin: boolean;
};

type Prediction = {
  race_id: string;
  status: "active" | "draft";
};

type MyLeague = {
  id: string;
  name: string;
  type: string;
  prize_pool: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const { races, meta, loading: racesLoading, error: racesError } = useRaceCatalog();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lockedRaceIds, setLockedRaceIds] = useState<Set<string>>(new Set());
  const [predictedRaceIds, setPredictedRaceIds] = useState<Map<string, "active" | "draft">>(new Map());
  const [scoredRaceIds, setScoredRaceIds] = useState<Set<string>>(new Set());
  const [totalPoints, setTotalPoints] = useState(0);
  const [leagueCount, setLeagueCount] = useState(0);
  const [myLeagues, setMyLeagues] = useState<MyLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadWarning, setLoadWarning] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoadWarning("");
      setLoading(true);

      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setLoadWarning(
            "Live data is unavailable in this environment. Showing the season schedule only."
          );
          setLoading(false);
        }
        return;
      }

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        if (!user) {
          router.push("/");
          return;
        }

        const [profileResult, predictionsResult, scoresResult, leagueCountResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("username, balance_usdc, is_admin")
            .eq("id", user.id)
            .single(),
          supabase.from("predictions").select("race_id, status").eq("user_id", user.id),
          supabase.from("race_scores").select("race_id, total_score").eq("user_id", user.id),
          supabase
            .from("league_members")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        const warningParts: string[] = [];

        if (profileResult.error) {
          console.error("[Gridlock] Dashboard profile load failed:", profileResult.error.message);
          warningParts.push("profile details");
        } else {
          if (!profileResult.data?.username) {
            router.replace("/onboarding");
            return;
          }
          if (!cancelled) {
            setProfile(profileResult.data);
          }
        }

        if (predictionsResult.error) {
          console.error("[Gridlock] Dashboard predictions load failed:", predictionsResult.error.message);
          warningParts.push("saved predictions");
          if (!cancelled) setPredictedRaceIds(new Map());
        } else {
          const predicted = new Map<string, "active" | "draft">();
          for (const prediction of (predictionsResult.data ?? []) as Prediction[]) {
            predicted.set(prediction.race_id, prediction.status);
          }
          if (!cancelled) setPredictedRaceIds(predicted);
        }

        if (!scoresResult.error) {
          const scored = new Set<string>();
          let pts = 0;
          for (const row of scoresResult.data ?? []) {
            scored.add(row.race_id);
            pts += Number(row.total_score ?? 0);
          }
          if (!cancelled) {
            setScoredRaceIds(scored);
            setTotalPoints(pts);
          }
        }

        if (!leagueCountResult.error && !cancelled) {
          setLeagueCount(leagueCountResult.count ?? 0);
        }

        // Fetch my leagues for the strip
        try {
          const leaguesRes = await fetch("/api/leagues");
          if (leaguesRes.ok) {
            const leaguesData = await leaguesRes.json();
            const memberLeagues = (leaguesData.leagues ?? []).filter(
              (l: { is_member?: boolean }) => l.is_member
            ) as MyLeague[];
            if (!cancelled) setMyLeagues(memberLeagues.slice(0, 5));
          }
        } catch {
          // Non-critical — league strip is optional
        }

        if (!cancelled && warningParts.length > 0) {
          setLoadWarning(
            `We couldn't load ${warningParts.join(" and ")}. Showing the season schedule with limited live data.`
          );
        }
      } catch (err) {
        console.error("[Gridlock] Dashboard bootstrap failed:", err);
        if (!cancelled) {
          setLoadWarning(
            "Live dashboard data is temporarily unavailable. Showing the season schedule only."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (!loading && !racesLoading) {
      track("dashboard_viewed", { race_count: races.length });
    }
  }, [loading, races.length, racesLoading]);

  useEffect(() => {
    const now = new Date();
    const locked = new Set<string>();
    for (const race of races) {
      const pastDeadline =
        race.qualifying_starts_at != null &&
        now >= new Date(race.qualifying_starts_at);
      if (race.race_locked || race.is_locked || pastDeadline || race.status === "closed") {
        locked.add(race.id);
      }
    }
    setLockedRaceIds(locked);
  }, [races]);

  const nextRace = races.find(
    (r) => !lockedRaceIds.has(r.id) && r.status !== "closed"
  );

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={profile} />

      <div className="gla-content">
        {loadWarning && (
          <div className="dash-runtime-banner" role="status">
            <span className="dash-runtime-banner-text">{loadWarning}</span>
          </div>
        )}
        {racesError && (
          <div className="dash-runtime-banner" role="status">
            <span className="dash-runtime-banner-text">
              We couldn&apos;t load the live race calendar. Please refresh.
            </span>
          </div>
        )}
        {(loading || racesLoading) && (
          <div className="dash-runtime-banner is-loading" role="status">
            <span className="dash-runtime-banner-text">
              Syncing your latest dashboard data...
            </span>
          </div>
        )}

        {/* Stats row */}
        <div className="dash-stats-row">
          <div className="dash-stat-card">
            <span className="dash-stat-label">Season Points</span>
            <span className="dash-stat-value">
              {loading ? "—" : totalPoints > 0 ? totalPoints.toFixed(1) : "0"}
            </span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Leagues</span>
            <span className="dash-stat-value">
              {loading ? "—" : leagueCount}
            </span>
          </div>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Next Race</span>
            <span className="dash-stat-value dash-stat-value--race">
              {racesLoading ? "—" : nextRace ? nextRace.name : "Season complete"}
            </span>
          </div>
          {profile?.balance_usdc !== undefined && (
            <Link href="/wallet" className="dash-stat-card dash-stat-card--balance" title="Test USDC · Not real money">
              <span className="dash-stat-label">Balance [BETA]</span>
              <span className="dash-stat-value">₮{Number(profile.balance_usdc).toFixed(2)}</span>
            </Link>
          )}
        </div>

        {/* Next race feature */}
        {nextRace && !racesLoading && (
          <div className="dash-next-race">
            <div className="dash-next-race-meta">
              <span className="dash-next-race-label">Next Race · Round {nextRace.round}</span>
              <h2 className="dash-next-race-name">{nextRace.name}</h2>
              <p className="dash-next-race-info">
                {nextRace.country}
                {nextRace.date
                  ? ` · ${new Date(nextRace.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                  : ""}
              </p>
            </div>
            <Link
              className="gla-race-btn"
              href={
                predictedRaceIds.get(nextRace.id) === "draft"
                  ? `/leagues?raceId=${nextRace.id}`
                  : `/predict/${nextRace.id}`
              }
              onClick={() =>
                track("race_card_clicked", {
                  action: predictedRaceIds.has(nextRace.id) ? "edit_prediction" : "predict",
                  race_id: nextRace.id,
                  source: "next_race_banner",
                })
              }
            >
              {predictedRaceIds.get(nextRace.id) === "active"
                ? "Edit Picks →"
                : predictedRaceIds.get(nextRace.id) === "draft"
                ? "Enter Now →"
                : "Make Picks →"}
            </Link>
          </div>
        )}

        {/* My leagues strip */}
        {myLeagues.length > 0 && (
          <div className="dash-leagues-section">
            <div className="dash-section-header">
              <span className="dash-section-title">My Leagues</span>
              <Link href="/leagues" className="dash-section-link">View All →</Link>
            </div>
            <div className="dash-leagues-strip">
              {myLeagues.map((league) => (
                <Link key={league.id} href={`/leagues/${league.id}`} className="dash-league-chip">
                  <span className={`dash-league-chip-type ${league.type}`}>{league.type}</span>
                  <span className="dash-league-chip-name">{league.name}</span>
                  {league.prize_pool > 0 && (
                    <span className="dash-league-chip-pool">${Number(league.prize_pool).toFixed(0)} pool</span>
                  )}
                </Link>
              ))}
              <Link href="/leagues/create" className="dash-league-chip dash-league-chip--create">
                <span>+ Create League</span>
              </Link>
            </div>
          </div>
        )}

        {/* Race grid */}
        <div className="dash-section-header" style={{ marginTop: myLeagues.length > 0 ? "2.5rem" : "0" }}>
          <div>
            <p className="gla-page-title">2026 Season</p>
            <p className="gla-page-sub">
              {meta.totalRounds || races.length} rounds · select a race to make your predictions
            </p>
          </div>
        </div>

        <div className="gla-race-grid">
          {races.map((race) => {
            const isClosed = lockedRaceIds.has(race.id) || race.status === "closed";
            const isNext = nextRace?.id === race.id;
            return (
              <article className={`gla-race-card${isNext ? " is-next" : ""}`} key={race.id}>
                <p className="gla-race-round">Round {race.round}</p>
                <h2 className="gla-race-name">{race.name}</h2>
                <p className="gla-race-meta">
                  {race.country}
                  <span className="gla-race-sep" />
                  {race.date
                    ? new Date(race.date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })
                    : "Date TBD"}
                </p>
                <span className={`gla-race-status ${isClosed ? "is-closed" : "is-upcoming"}`}>
                  {isClosed ? "Locked" : "Open"}
                </span>
                {isClosed ? (
                  scoredRaceIds.has(race.id) ? (
                    <Link className="gla-race-btn is-edit" href={`/scores/${race.id}`}>View Score</Link>
                  ) : (
                    <span className="gla-race-btn is-disabled">Locked</span>
                  )
                ) : predictedRaceIds.has(race.id) ? (
                  predictedRaceIds.get(race.id) === "draft" ? (
                    <Link
                      className="gla-race-btn"
                      href={`/leagues?raceId=${race.id}`}
                      onClick={() =>
                        track("race_card_clicked", { action: "enter_now", race_id: race.id })
                      }
                    >
                      Enter Now
                    </Link>
                  ) : (
                    <Link
                      className="gla-race-btn is-edit"
                      href={`/predict/${race.id}`}
                      onClick={() =>
                        track("race_card_clicked", { action: "edit_prediction", race_id: race.id })
                      }
                      title="Saved prediction"
                    >
                      Edit
                    </Link>
                  )
                ) : (
                  <Link
                    className="gla-race-btn"
                    href={`/predict/${race.id}`}
                    onClick={() =>
                      track("race_card_clicked", { action: "predict", race_id: race.id })
                    }
                  >
                    Predict
                  </Link>
                )}
                {!isClosed && predictedRaceIds.get(race.id) === "draft" && (
                  <p className="gla-race-draft-warning">Picks saved — not entered yet</p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
