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

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [lockedRaceIds, setLockedRaceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }

      const [{ data: profileData }, { data: dbRaces }] = await Promise.all([
        supabase.from("profiles").select("username, balance_usdc, is_admin").eq("id", user.id).single(),
        supabase.from("races").select("id, race_locked, qualifying_starts_at"),
      ]);

      setProfile(profileData);

      const now = new Date();
      const locked = new Set<string>();
      for (const r of (dbRaces ?? []) as DbRace[]) {
        const pastDeadline = r.qualifying_starts_at != null && now >= new Date(r.qualifying_starts_at);
        if (r.race_locked || pastDeadline) locked.add(r.id);
      }
      setLockedRaceIds(locked);
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
