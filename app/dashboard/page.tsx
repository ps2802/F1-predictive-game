"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { races } from "@/lib/races";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type UserProfile = {
  username: string | null;
  balance_usdc: number;
  is_admin: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("profiles")
        .select("username, balance_usdc, is_admin")
        .eq("id", user.id)
        .single();
      setProfile(data);
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
            <Link href="/wallet" className="dash-balance-pill">
              ${Number(profile.balance_usdc).toFixed(2)} USDC
            </Link>
          )}
        </div>

        <div className="gla-race-grid">
          {races.map((race) => {
            const isClosed = race.status === "closed";
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
