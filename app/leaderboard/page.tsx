"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LeaderboardEntry = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  total_score: number;
  races_played: number;
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setCurrentUserId(user.id);

      const { data } = await supabase
        .from("leaderboard")
        .select("*")
        .limit(100);

      setEntries(data ?? []);
      setLoading(false);
    }
    load();
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

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav />

      <div className="gla-content">
        <p className="gla-page-title">Global Leaderboard</p>
        <p className="gla-page-sub">Season 2026 · all races</p>

        <div className="lb-table">
          <div className="lb-header">
            <span>Rank</span>
            <span>Driver</span>
            <span>Races</span>
            <span>Score</span>
          </div>

          {entries.length === 0 ? (
            <div className="lb-empty">
              No scores yet — predictions are still being settled.
            </div>
          ) : (
            entries.map((entry, i) => (
              <div
                key={entry.user_id}
                className={`lb-row${entry.user_id === currentUserId ? " is-you" : ""}${i < 3 ? ` is-top-${i + 1}` : ""}`}
              >
                <span className="lb-rank">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span className="lb-name">
                  {entry.username ?? "Anonymous"}
                  {entry.user_id === currentUserId && (
                    <span className="lb-you-badge"> you</span>
                  )}
                </span>
                <span className="lb-races">{entry.races_played}</span>
                <span className="lb-score">
                  {Number(entry.total_score).toFixed(1)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AppNav() {
  const router = useRouter();
  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }
  return (
    <nav className="gla-nav">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/gridlock logo - transparent.png" alt="Gridlock" className="gla-nav-logo" draggable={false} />
      <div className="gla-nav-right">
        <Link className="gla-nav-link" href="/dashboard">Races</Link>
        <Link className="gla-nav-link" href="/leagues">Leagues</Link>
        <Link className="gla-nav-link" href="/leaderboard">Leaderboard</Link>
        <Link className="gla-nav-link" href="/profile">Profile</Link>
        <button className="gla-nav-link" onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}
