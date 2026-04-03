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

type Prediction = {
  race_id: string;
  status: "draft" | "active";
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lockedRaceIds, setLockedRaceIds] = useState<Set<string>>(new Set());
  const [predictedRaceIds, setPredictedRaceIds] = useState<Set<string>>(new Set());
  const [draftRaceIds, setDraftRaceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }

      const [{ data: profileData }, { data: dbRaces }, { data: userPreds }] = await Promise.all([
        supabase.from("profiles").select("username, balance_usdc, is_admin").eq("id", user.id).single(),
        supabase.from("races").select("id, race_locked, qualifying_starts_at"),
        supabase.from("predictions").select("race_id, status").eq("user_id", user.id),
      ]);

      setProfile(profileData);

      const now = new Date();
      const locked = new Set<string>();
      for (const r of (dbRaces ?? []) as DbRace[]) {
        const pastDeadline = r.qualifying_starts_at != null && now >= new Date(r.qualifying_starts_at);
        if (r.race_locked || pastDeadline) locked.add(r.id);
      }
      setLockedRaceIds(locked);

      const predicted = new Set<string>();
      const drafts = new Set<string>();
      for (const p of (userPreds ?? []) as Prediction[]) {
        predicted.add(p.race_id);
        if (p.status === "draft") drafts.add(p.race_id);
      }
      setPredictedRaceIds(predicted);
      setDraftRaceIds(drafts);
    });
  }, [router]);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={profile} />

      <div className="gla-content">
        {/* Draft predictions banner — shown when user has predictions not yet in a league */}
        {draftRaceIds.size > 0 && (
          <div className="dash-draft-banner">
            <span className="dash-draft-banner-text">
              <strong>{draftRaceIds.size} prediction{draftRaceIds.size > 1 ? "s" : ""} saved as draft.</strong>{" "}
              Join any league — including free ones — to activate them and start scoring.
            </span>
            <Link href="/leagues" className="dash-draft-banner-cta">
              Join a League →
            </Link>
          </div>
        )}

        <div className="dash-header">
          <div>
            <p className="gla-page-title">2026 Season</p>
            <p className="gla-page-sub">
              {races.length} rounds · select a race to make your predictions
            </p>
          </div>
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
                  {new Date(race.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
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
                    title={draftRaceIds.has(race.id) ? "Draft — join a league to activate" : "Active prediction"}
                  >
                    {draftRaceIds.has(race.id) ? "Edit (Draft)" : "Edit"}
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

