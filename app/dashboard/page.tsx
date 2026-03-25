"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { races } from "@/lib/races";
import { usePrivy } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }

      const [{ data: profileData }, { data: dbRaces }, { data: scoresData }] = await Promise.all([
        supabase.from("profiles").select("username, balance_usdc, is_admin").eq("id", user.id).single(),
        supabase.from("races").select("id, race_locked, qualifying_starts_at"),
        supabase.from("race_scores").select("race_id, total_score").eq("user_id", user.id),
      ]);

      setProfile(profileData);

      const now = new Date();
      const locked = new Set<string>();
      for (const r of (dbRaces ?? []) as DbRace[]) {
        const pastDeadline = r.qualifying_starts_at != null && now >= new Date(r.qualifying_starts_at);
        if (r.race_locked || pastDeadline) locked.add(r.id);
      }
      setLockedRaceIds(locked);

      const scoresMap = new Map<string, number>();
      for (const s of (scoresData ?? []) as RaceScore[]) {
        scoresMap.set(s.race_id, s.total_score);
      }
      setSettledScores(scoresMap);
    });
  }, [router]);

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

function AppNav({ profile }: { profile: UserProfile | null }) {
  const router = useRouter();
  const { logout } = usePrivy();
  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    await logout();
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
        <Link className="gla-nav-link" href="/dashboard">Races</Link>
        <Link className="gla-nav-link" href="/leagues">Leagues</Link>
        <Link className="gla-nav-link" href="/leaderboard">Leaderboard</Link>
        <Link className="gla-nav-link" href="/profile">
          {profile?.username ? `@${profile.username}` : "Profile"}
        </Link>
        {profile?.is_admin && (
          <Link className="gla-nav-link" href="/admin" style={{ color: "var(--gl-red)" }}>
            Admin
          </Link>
        )}
        <button className="gla-nav-link" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
