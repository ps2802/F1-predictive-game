"use client";

import { useEffect, useState } from "react";
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

export default function LeaguePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberScore[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setCurrentUserId(user.id);

      const { data: leagueData } = await supabase
        .from("leagues")
        .select("*")
        .eq("id", leagueId)
        .single();

      if (!leagueData) { router.push("/leagues"); return; }
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
    load();
  }, [leagueId, router]);

  function copyInvite() {
    if (!league) return;
    const link = `${window.location.origin}/join/${league.invite_code}`;
    // Share message is pre-composed so recipients understand the context immediately
    const shareText = `Join my Gridlock league "${league.name}" — predict the F1 podium every race and prove you know the grid. ${link}`;
    navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  if (!league) return null;

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
              {league.entry_fee_usdc > 0 && ` · $${league.entry_fee_usdc} USDC entry`}
              {league.prize_pool > 0 && ` · 🏆 $${league.prize_pool} prize pool`}
            </p>
          </div>

          {league.type === "private" && (
            <div className="league-invite-box">
              <span className="league-invite-label">Invite Code</span>
              <code className="league-invite-code">{league.invite_code}</code>
              <button className="league-copy-btn" onClick={copyInvite}>
                {copied ? "Message copied!" : "Copy Invite"}
              </button>
              <span className="league-invite-hint">
                Copies a ready-to-send message with your league link
              </span>
            </div>
          )}
        </div>

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
