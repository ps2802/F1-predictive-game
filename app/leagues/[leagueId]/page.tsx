"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppNav } from "@/app/components/AppNav";

type League = {
  id: string;
  name: string;
  type: string;
  invite_code: string;
  entry_fee_usdc: number;
  prize_pool: number;
  member_count: number;
  max_users: number;
  creator_id: string;
};

type MemberScore = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  total_score: number;
  races_played: number;
};

/** Compute prize pool from member count × entry fee if the stored value is 0. */
function computePrizePool(league: League): number {
  if (league.prize_pool > 0) return league.prize_pool;
  return league.member_count * league.entry_fee_usdc;
}

export default function LeaguePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberScore[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared">("idle");

  async function load() {
    setLoadError("");
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setLoading(false); return; }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setCurrentUserId(user.id);

    const { data: leagueData, error: leagueError } = await supabase
      .from("leagues")
      .select("*")
      .eq("id", leagueId)
      .single();

    if (leagueError || !leagueData) {
      setLoadError("Couldn't load league. Please try again.");
      setLoading(false);
      return;
    }
    setLeague(leagueData);

    // League leaderboard
    const { data: lb } = await supabase
      .from("league_leaderboard")
      .select("*")
      .eq("league_id", leagueId)
      .order("total_score", { ascending: false });

    setMembers(lb ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, router]);

  /** Build the canonical invite URL for sharing. */
  function buildInviteUrl(inviteCode: string): string {
    return `https://joingridlock.com/join/${inviteCode}`;
  }

  /** Share via Web Share API if available, otherwise copy to clipboard. */
  const handleShare = useCallback(async () => {
    if (!league) return;

    const url = buildInviteUrl(league.invite_code);
    const text = `I'm competing in ${league.name} on Gridlock — predict the F1 podium and win real prizes. Join here: ${url}`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `Join ${league.name} on Gridlock`, text, url });
        setShareStatus("shared");
        setTimeout(() => setShareStatus("idle"), 2500);
      } catch {
        // User cancelled share — not an error
      }
      return;
    }

    // Fallback: clipboard copy
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2500);
    } catch {
      // clipboard not available — silently fail
    }
  }, [league]);

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
        <AppNav />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <h1 className="gla-page-title">Something went wrong</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>{loadError}</p>
          <button
            className="gla-race-btn"
            style={{ marginTop: "2rem" }}
            onClick={load}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!league) return null;

  const prizePool = computePrizePool(league);
  const myContribution = currentUserId && league.entry_fee_usdc > 0
    ? league.entry_fee_usdc
    : 0;
  const isCurrentUserMember = members.some((m) => m.user_id === currentUserId);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav />

      <div className="gla-content">
        <Link href="/leagues" className="predict-back">← Leagues</Link>

        {/* League header */}
        <div className="league-detail-header">
          <div>
            <span className={`league-card-type ${league.type}`}>{league.type}</span>
            <h1 className="gla-page-title" style={{ marginTop: "0.5rem" }}>{league.name}</h1>
            <p className="gla-page-sub">
              {league.member_count}/{league.max_users} members
              {league.entry_fee_usdc > 0
                ? ` · $${league.entry_fee_usdc} USDC entry`
                : " · Free to join"}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-end" }}>
            {/* Prize pool — shown prominently */}
            {prizePool > 0 && (
              <div className="league-prize-banner">
                <span className="league-prize-banner-label">Prize Pool</span>
                <span className="league-prize-banner-amount">${prizePool.toFixed(2)} USDC</span>
              </div>
            )}

            {/* My contribution */}
            {isCurrentUserMember && myContribution > 0 && (
              <p style={{ fontSize: "0.78rem", color: "rgba(0,210,170,0.85)", margin: 0 }}>
                Your contribution: ${myContribution.toFixed(2)} USDC
              </p>
            )}

            {/* Share / invite button */}
            <div className="league-invite-box">
              <span className="league-invite-label">Invite Code</span>
              <code className="league-invite-code">{league.invite_code}</code>
              <button className="league-copy-btn" onClick={handleShare}>
                {shareStatus === "copied"
                  ? "Link Copied!"
                  : shareStatus === "shared"
                  ? "Shared!"
                  : "Share"}
              </button>
              <span className="league-invite-hint">
                Shares a ready-to-send message with your league link
              </span>
            </div>
          </div>
        </div>

        {/* Toast-style confirmation when link is copied */}
        {shareStatus === "copied" && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: "fixed",
              bottom: "2rem",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(0,210,170,0.15)",
              border: "1px solid rgba(0,210,170,0.4)",
              color: "rgba(0,210,170,1)",
              padding: "0.625rem 1.25rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 600,
              zIndex: 100,
              pointerEvents: "none",
            }}
          >
            Invite link copied to clipboard
          </div>
        )}

        {/* Leaderboard */}
        <div className="lb-table" style={{ marginTop: "2rem" }}>
          <div className="lb-header">
            <span>Rank</span>
            <span>Player</span>
            <span>Races</span>
            <span>Score</span>
          </div>

          {members.length === 0 ? (
            <div className="lb-empty">
              <p className="lb-empty-headline">No predictions locked in yet.</p>
              <p className="lb-empty-sub">Be first on this grid — every race missed is points your rivals can take.</p>
              <Link href="/dashboard" className="gla-race-btn" style={{ display: "inline-block", marginTop: "1.25rem" }}>
                Make Your Predictions
              </Link>
            </div>
          ) : (
            members.map((m, i) => (
              <div
                key={m.user_id}
                className={`lb-row${m.user_id === currentUserId ? " is-you" : ""}${i < 3 ? ` is-top-${i + 1}` : ""}`}
              >
                <span className="lb-rank">
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                </span>
                <span className="lb-name">
                  {m.username ?? "Anonymous"}
                  {m.user_id === currentUserId && (
                    <span className="lb-you-badge"> you</span>
                  )}
                </span>
                <span className="lb-races">{m.races_played}</span>
                <span className="lb-score">{Number(m.total_score).toFixed(1)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
