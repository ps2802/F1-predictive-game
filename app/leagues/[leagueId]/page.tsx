"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";

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
  payout_model: string;
  payout_config: PayoutConfig | null;
};

interface PayoutConfig {
  tiers?: { place: number; percent: number }[];
}

type MemberScore = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  total_score: number;
  races_played: number;
};

type NavProfile = {
  username: string | null;
  is_admin: boolean;
};

const DEFAULT_PAYOUT_TIERS = [
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
];

function getNextRaceLockCountdown(): string {
  const now = new Date();
  const nextRace = races.find((r) => new Date(r.date) >= now);
  if (!nextRace) return "Season complete";
  const diff = new Date(nextRace.date).getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

export default function LeaguePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberScore[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(() => getNextRaceLockCountdown());
  const [nextRacePredStatus, setNextRacePredStatus] = useState<"active" | "draft" | "none">("none");
  const [navProfile, setNavProfile] = useState<NavProfile | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getNextRaceLockCountdown());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setCurrentUserId(user.id);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("username, is_admin")
        .eq("id", user.id)
        .single();
      setNavProfile(profileData);

      const { data: leagueData } = await supabase
        .from("leagues")
        .select("*")
        .eq("id", leagueId)
        .single();

      if (!leagueData) { router.push("/leagues"); return; }
      setLeague(leagueData);

      const { data: lb } = await supabase
        .from("league_leaderboard")
        .select("*")
        .eq("league_id", leagueId)
        .order("total_score", { ascending: false });

      setMembers(lb ?? []);

      // Load prediction status for the next open race so the CTA is contextual
      const now = new Date();
      const nextRace = races.find((r) => r.status === "upcoming" && new Date(r.date) > now);
      if (nextRace && user) {
        const { data: pred } = await supabase
          .from("predictions")
          .select("status")
          .eq("race_id", nextRace.id)
          .eq("user_id", user.id)
          .single();
        setNextRacePredStatus((pred?.status as "active" | "draft") ?? "none");
      }

      setLoading(false);
    }
    load();
  }, [leagueId, router]);

  function copyInvite() {
    if (!league) return;
    const link = `${window.location.origin}/join/${league.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
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

  const payoutTiers: { place: number; percent: number }[] =
    (league.payout_config as PayoutConfig)?.tiers ?? DEFAULT_PAYOUT_TIERS;
  const pool = Number(league.prize_pool);
  const now = new Date();
  const nextOpenRace = races.find((r) => r.status === "upcoming" && new Date(r.date) > now);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav
        isAdmin={navProfile?.is_admin ?? false}
        profileLabel={navProfile?.username ? `@${navProfile.username}` : "Profile"}
      />

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
            </p>
          </div>

          {league.type === "private" && (
            <div className="league-invite-box">
              <span className="league-invite-label">Invite Code</span>
              <code className="league-invite-code">{league.invite_code}</code>
              <button className="league-copy-btn" onClick={copyInvite}>
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>
          )}
        </div>

        {/* Economics strip */}
        <div className="league-economics">
          {pool > 0 && (
            <div className="league-econ-card">
              <span className="league-econ-value">${pool.toFixed(2)}</span>
              <span className="league-econ-label">Prize Pool</span>
            </div>
          )}
          <div className="league-econ-card">
            <span className="league-econ-value">{countdown}</span>
            <span className="league-econ-label">Next Lock</span>
          </div>
          {pool > 0 && (
            <div className="league-econ-card">
              <span className="league-econ-value">${(pool * (payoutTiers[0]?.percent ?? 50) / 100).toFixed(2)}</span>
              <span className="league-econ-label">1st Place Wins</span>
            </div>
          )}
        </div>

        {/* Payout distribution */}
        {(pool > 0 || league.entry_fee_usdc > 0) && (
          <div className="league-payout-section">
            <h3 className="league-section-title">Payout Distribution</h3>
            <div className="league-payout-tiers">
              {payoutTiers.map((tier) => (
                <div key={tier.place} className="league-payout-tier">
                  <span className="league-payout-place">
                    {tier.place === 1 ? "1st" : tier.place === 2 ? "2nd" : tier.place === 3 ? "3rd" : `${tier.place}th`}
                  </span>
                  <div className="league-payout-bar-bg">
                    <div className="league-payout-bar" style={{ width: `${tier.percent}%` }} />
                  </div>
                  <span className="league-payout-pct">{tier.percent}%</span>
                  {pool > 0 && (
                    <span className="league-payout-amt">${(pool * tier.percent / 100).toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Context-aware prediction CTA */}
        {nextOpenRace && (
          <div className="league-predict-cta">
            <div className="league-predict-cta-text">
              {nextRacePredStatus === "active" ? (
                <>
                  <strong>Your picks for {nextOpenRace.name} are active.</strong>
                  <span>They&apos;ll score once the race is settled. You can update them any time before the deadline.</span>
                </>
              ) : nextRacePredStatus === "draft" ? (
                <>
                  <strong>You have a draft prediction for {nextOpenRace.name}.</strong>
                  <span>Since you&apos;re in this league it should already be active — if it still shows Draft, please refresh or contact support.</span>
                </>
              ) : (
                <>
                  <strong>No prediction yet for {nextOpenRace.name}.</strong>
                  <span>Predictions count towards all leagues you&apos;re in once the race is settled.</span>
                </>
              )}
            </div>
            <Link
              href={`/predict/${nextOpenRace.id}`}
              className="gla-race-btn"
              style={{ whiteSpace: "nowrap", flexShrink: 0 }}
            >
              {nextRacePredStatus === "none"
                ? `Predict ${nextOpenRace.name} →`
                : `Edit ${nextOpenRace.name} →`}
            </Link>
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
              No scores yet — be the first to make predictions!
            </div>
          ) : (
            members.map((m, i) => (
              <div
                key={m.user_id}
                className={`lb-row${m.user_id === currentUserId ? " is-you" : ""}${i < 3 ? ` is-top-${i + 1}` : ""}`}
              >
                <span className="lb-rank">
                  {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
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
