"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
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

export default function DashboardPage() {
  const router = useRouter();
  const { races, meta, loading: racesLoading, error: racesError } = useRaceCatalog();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lockedRaceIds, setLockedRaceIds] = useState<Set<string>>(new Set());
  const [predictedRaceIds, setPredictedRaceIds] = useState<Set<string>>(new Set());
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
          router.push("/login");
          return;
        }

        const [profileResult, predictionsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("username, balance_usdc, is_admin")
            .eq("id", user.id)
            .single(),
          supabase.from("predictions").select("race_id, status").eq("user_id", user.id),
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
          console.error(
            "[Gridlock] Dashboard predictions load failed:",
            predictionsResult.error.message
          );
          warningParts.push("saved predictions");
          if (!cancelled) {
            setPredictedRaceIds(new Set());
          }
        } else {
          const predicted = new Set<string>();
          for (const prediction of (predictionsResult.data ?? []) as Prediction[]) {
            predicted.add(prediction.race_id);
          }
          if (!cancelled) {
            setPredictedRaceIds(predicted);
          }
        }

        if (!cancelled && warningParts.length > 0) {
          setLoadWarning(
            `We couldn't load ${warningParts.join(" and ")}. Showing the season schedule with limited live data.`
          );
        }
      } catch (error) {
        console.error("[Gridlock] Dashboard bootstrap failed:", error);
        if (!cancelled) {
          setLoadWarning(
            "Live dashboard data is temporarily unavailable. Showing the season schedule only."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router]);

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

        <div className="dash-header">
          <div>
            <p className="gla-page-title">2026 Season</p>
            <p className="gla-page-sub">
              {meta.totalRounds || races.length} rounds · select a race to make your predictions
            </p>
          </div>
          {profile?.balance_usdc !== undefined && (
            <Link href="/wallet" className="dash-balance-pill" title="Test USDC · Not real money">
              ₮{Number(profile.balance_usdc).toFixed(2)}&nbsp;[BETA]
            </Link>
          )}
        </div>

        <div className="gla-race-grid">
          {races.map((race) => {
            // A race is locked if: DB says so, OR hardcoded status is "closed" (fallback for races not yet in DB)
            const isClosed = lockedRaceIds.has(race.id) || race.status === "closed";
            return (
              <article className="gla-race-card" key={race.id}>
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
                  <span className="gla-race-btn is-disabled">Locked</span>
                ) : predictedRaceIds.has(race.id) ? (
                  <Link
                    className="gla-race-btn is-edit"
                    href={`/predict/${race.id}`}
                    title="Saved prediction"
                  >
                    Edit
                  </Link>
                ) : (
                  <Link className="gla-race-btn" href={`/predict/${race.id}`}>
                    Predict
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
