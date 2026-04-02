"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppNav } from "@/app/components/AppNav";
import { track } from "@/lib/analytics";

type LeaderboardEntry = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  total_score: number;
  raw_total?: number;
  loyalty_multiplier?: number;
  races_played: number;
  races_dropped?: number;
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
      setCurrentUserId(user.id);

      const res = await fetch("/api/leaderboard");
      if (!res.ok) {
        setError("Failed to load leaderboard. Please refresh.");
      } else {
        const data = await res.json();
        setEntries(data.entries ?? []);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  useEffect(() => {
    if (!loading && !error) {
      track("leaderboard_viewed", {
        entry_count: entries.length,
      });
    }
  }, [entries.length, error, loading]);

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <p style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</p>
          <h1 className="gla-page-title">Something went wrong</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>{error}</p>
          <button
            className="gla-race-btn"
            style={{ marginTop: "2rem" }}
            onClick={() => { setError(""); setLoading(true); router.refresh(); }}
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
              <p className="lb-empty-headline">No scores posted yet for this season.</p>
              <p className="lb-empty-sub">Make your predictions before qualifying to appear here once results are settled.</p>
              <Link href="/dashboard" className="gla-race-btn" style={{ display: "inline-block", marginTop: "1.25rem" }}>
                Make Your Predictions
              </Link>
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
                  {entry.loyalty_multiplier && entry.loyalty_multiplier > 1 && (
                    <span className="lb-loyalty-badge" title={`${entry.loyalty_multiplier}× loyalty bonus`}>
                      🔥 {entry.loyalty_multiplier}×
                    </span>
                  )}
                </span>
                <span className="lb-races">{entry.races_played}</span>
                <span className="lb-score">
                  {Number(entry.total_score).toFixed(1)}
                </span>
              </div>
            ))
          )}
          {currentUserId && !entries.some(e => e.user_id === currentUserId) && (
            <div className="lb-row is-you lb-pinned-you">
              <span className="lb-rank">—</span>
              <span className="lb-name">You <span className="lb-you-badge">not yet ranked</span></span>
              <span className="lb-races">—</span>
              <span className="lb-score">—</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
