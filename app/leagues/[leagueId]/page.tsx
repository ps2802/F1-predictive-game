"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";

type League = {
  id: string;
  race_id: string | null;
  name: string;
  type: string;
  invite_code: string;
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

type NavProfile = {
  username: string | null;
  is_admin: boolean;
};

type ActiveTab = "leaderboard" | "predictions" | "races";

function getRaceCountdown(raceId: string | null): string {
  if (!raceId) return "TBD";
  const race = races.find((entry) => entry.id === raceId);
  if (!race) return "TBD";
  const diff = new Date(race.date).getTime() - Date.now();
  if (diff <= 0) return "Locked";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

function getNextOpenRace(): (typeof races)[number] | null {
  const now = new Date();
  return races.find(
    (race) => race.status === "upcoming" && new Date(race.date) > now
  ) ?? races.find((race) => race.status === "upcoming") ?? null;
}

export default function LeaguePage(): React.ReactElement | null {
  const params = useParams();
  const router = useRouter();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberScore[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState("TBD");
  const [nextRacePredStatus, setNextRacePredStatus] = useState<"active" | "draft" | "none">("none");
  const [navProfile, setNavProfile] = useState<NavProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("leaderboard");

  useEffect(() => {
    const interval = setInterval(() => {
      const raceIdForCountdown = league?.race_id ?? getNextOpenRace()?.id ?? null;
      setCountdown(getRaceCountdown(raceIdForCountdown));
    }, 60_000);
    return () => clearInterval(interval);
  }, [league?.race_id]);

  useEffect(() => {
    async function load(): Promise<void> {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/"); return; }
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
      const nextRace = leagueData.race_id
        ? races.find((race) => race.id === leagueData.race_id) ?? null
        : getNextOpenRace();
      setCountdown(getRaceCountdown(nextRace?.id ?? null));

      const { data: membershipData } = await supabase
        .from("league_members")
        .select("id")
        .eq("league_id", leagueId)
        .eq("user_id", user.id)
        .maybeSingle();

      const member = Boolean(membershipData);
      setIsMember(member);
      if (!member) {
        setActiveTab("predictions");
      }

      const leaderboardRes = await fetch(`/api/leagues/${leagueId}/leaderboard`, {
        cache: "no-store",
      });
      if (leaderboardRes.ok) {
        const leaderboardData = await leaderboardRes.json();
        setMembers(leaderboardData.entries ?? []);
      } else {
        setMembers([]);
      }

      if (nextRace?.id && user) {
        const { data: pred } = await supabase
          .from("predictions")
          .select("status")
          .eq("race_id", nextRace.id)
          .eq("user_id", user.id)
          .maybeSingle();
        setNextRacePredStatus((pred?.status as "active" | "draft") ?? "none");
      }

      setLoading(false);
    }
    load();
  }, [leagueId, router]);

  function copyInvite(): void {
    if (!league) return;
    const link = `${window.location.origin}/join/${league.invite_code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleJoinLeague(): Promise<void> {
    if (!league) return;
    setJoining(true);
    setJoinError("");

    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: league.invite_code }),
    });

    const data = await res.json();
    if (!res.ok) {
      setJoinError(data.error ?? "Failed to join league.");
      setJoining(false);
      return;
    }

    setIsMember(true);
    setLeague((prev) =>
      prev ? { ...prev, member_count: prev.member_count + 1 } : prev
    );
    setJoining(false);
    router.refresh();
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

  const leagueRace = races.find((race) => race.id === league.race_id);
  const targetRace = leagueRace ?? getNextOpenRace();
  const leagueRaceSchedule = leagueRace ? [leagueRace] : races.filter((race) => race.status === "upcoming");
  const countdownDisplay = countdown === "TBD" ? "Schedule Soon" : countdown;
  const racesLeft = races.filter(
    (r) => r.status === "upcoming" && new Date(r.date) > new Date()
  ).length;

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={navProfile} />

      <div className="gla-content">
        <Link href="/leagues" className="predict-back">← Leagues</Link>

        {/* League header */}
        <div className="league-detail-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
              <span className={`league-card-type ${league.type}`}>{league.type}</span>
              {targetRace && <span className="league-card-type" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>2026</span>}
            </div>
            <h1 className="gla-page-title">{league.name}</h1>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            {league.type === "private" && isMember && (
              <button
                className="gla-race-btn"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)" }}
                onClick={copyInvite}
              >
                {copied ? "Copied!" : "Share →"}
              </button>
            )}
            {targetRace && isMember && (
              <Link href={`/predict/${targetRace.id}`} className="gla-race-btn">
                {nextRacePredStatus === "none" ? "Make Picks →" : nextRacePredStatus === "draft" ? "Finish Picks →" : "Edit Picks →"}
              </Link>
            )}
          </div>
        </div>

        {/* Join CTA banner for non-members */}
        {!isMember && (
          <div className="league-join-cta-banner">
            <p>You&apos;re not in this league yet.</p>
            <button
              className="gla-race-btn"
              disabled={joining}
              onClick={handleJoinLeague}
            >
              {joining ? "Joining..." : "Join League →"}
            </button>
          </div>
        )}
        {!isMember && joinError && <p className="league-join-error">{joinError}</p>}

        {/* Stats row */}
        <div className="league-stats-row">
          <div className="league-stats-card">
            <span className="league-stats-label">Players</span>
            <span className="league-stats-value" data-testid="league-member-count">
              {league.member_count}
            </span>
          </div>
          <div className="league-stats-card">
            <span className="league-stats-label">Capacity</span>
            <span className="league-stats-value">{league.max_users}</span>
          </div>
          <div className="league-stats-card">
            <span className="league-stats-label">Races Left</span>
            <span className="league-stats-value">{racesLeft}</span>
          </div>
        </div>

        {/* Private league invite */}
        {league.type === "private" && isMember && (
          <div className="league-invite-box" style={{ marginBottom: "1.5rem" }}>
            <span className="league-invite-label">Invite Code</span>
            <code className="league-invite-code" data-testid="league-invite-code">
              {league.invite_code}
            </code>
            <button className="league-copy-btn" onClick={copyInvite} data-testid="league-invite-link">
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="league-tabs">
          {(["leaderboard", "predictions", "races"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`league-tab${activeTab === tab ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "leaderboard" ? "Leaderboard" : tab === "predictions" ? "Predictions" : "Races"}
            </button>
          ))}
        </div>

        {/* Leaderboard tab */}
        {activeTab === "leaderboard" && (
          <div>
            {/* Top 3 Podium */}
            {members.length >= 3 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
                {members.slice(0, 3).map((m, i) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const gradients = [
                    'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
                    'linear-gradient(135deg, #374151 0%, #6b7280 100%)',
                    'linear-gradient(135deg, #92400e 0%, #b45309 100%)',
                  ];
                  const borders = ['rgba(217, 119, 6, 0.5)', 'rgba(107, 114, 128, 0.5)', 'rgba(180, 83, 9, 0.5)'];
                  return (
                    <div key={m.user_id} style={{
                      background: gradients[i],
                      border: `1px solid ${borders[i]}`,
                      borderRadius: '12px',
                      padding: '1rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 700 }}>#{i+1}</span>
                        <span style={{ fontSize: '1.25rem' }}>{medals[i]}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem', color: '#fff', flexShrink: 0 }}>
                          {(m.username ?? 'A').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p style={{ color: '#fff', fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>
                            {m.user_id === currentUserId ? 'You' : (m.username ?? 'Anonymous')}
                          </p>
                          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', margin: 0 }}>{Number(m.total_score).toFixed(1)} pts</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="lb-table" style={{ marginTop: '1.5rem' }}>
              <div className="lb-header">
                <span>Rank</span>
                <span>Player</span>
                <span>Used</span>
                <span>Points</span>
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

            {/* Your Stats */}
            {isMember && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.25rem' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', margin: '0 0 1rem' }}>Your Stats</h3>
                  {(() => {
                    const myEntry = members.find(m => m.user_id === currentUserId);
                    const myRank = myEntry ? members.indexOf(myEntry) + 1 : null;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Current Rank</span>
                          <span style={{ color: '#E10600', fontWeight: 800, fontSize: '1rem' }}>{myRank ? `#${myRank}` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Your Points</span>
                          <span style={{ color: '#fff' }}>{myEntry ? `${Number(myEntry.total_score).toFixed(1)} pts` : '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Races Scored</span>
                          <span style={{ color: 'rgba(0,210,170,1)' }}>{myEntry ? myEntry.races_played : 0}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Predictions tab */}
        {activeTab === "predictions" && (
          <div style={{ marginTop: "1.5rem" }}>
            {/* Membership / join section */}
            {!isMember ? (
              <div className="league-join-box">
                <h3 className="league-join-title">Join This League</h3>
                <p className="league-entry-summary">
                  Jump in, lock your podium picks, and race your friends up the board.
                </p>
                <div className="league-join-form">
                  <button
                    type="button"
                    className="gla-race-btn"
                    disabled={joining}
                    onClick={handleJoinLeague}
                  >
                    {joining ? "Joining..." : "Join League"}
                  </button>
                </div>
                {joinError && <p className="league-join-error">{joinError}</p>}
              </div>
            ) : (
              <div className="league-join-box" style={{ marginBottom: "1.5rem" }}>
                <h3 className="league-join-title">You&apos;re In</h3>
                <p className="league-entry-summary">
                  You&apos;re competing in this league. Make your picks before lock to climb the board.
                </p>
              </div>
            )}

            {/* Prediction CTA */}
            {targetRace && (
              <div className="league-predict-cta">
                <div className="league-predict-cta-text">
                  <span
                    className={`league-card-type ${nextRacePredStatus === "active" ? "public" : "private"}`}
                    data-testid="prediction-status-badge"
                    style={{ marginBottom: "0.65rem", display: "inline-flex" }}
                  >
                    {nextRacePredStatus === "active"
                      ? "Prediction Active"
                      : nextRacePredStatus === "draft"
                        ? "Prediction Draft"
                        : "No Prediction"}
                  </span>
                  <span className="league-entry-note" data-testid="league-race-name" style={{ display: "block" }}>
                    {targetRace.name}
                  </span>
                  {nextRacePredStatus === "active" ? (
                    <>
                      <strong>Your picks for {targetRace.name} are locked in.</strong>
                      <span>They&apos;ll score once the race is settled.</span>
                    </>
                  ) : nextRacePredStatus === "draft" ? (
                    <>
                      <strong>Picks saved — finish them up.</strong>
                      <span>Complete your podium for {targetRace.name} before lock.</span>
                    </>
                  ) : (
                    <>
                      <strong>No prediction yet for {targetRace.name}.</strong>
                      <span>Your podium picks power the global board and this league once the race settles.</span>
                    </>
                  )}
                </div>
                <Link
                  href={`/predict/${targetRace.id}`}
                  className="gla-race-btn"
                  style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {nextRacePredStatus === "none"
                    ? `Predict ${targetRace.name} →`
                    : nextRacePredStatus === "draft"
                    ? "Finish Picks →"
                    : `Edit ${targetRace.name} →`}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Races tab */}
        {activeTab === "races" && (
          <div style={{ marginTop: "1.5rem" }}>
            {leagueRaceSchedule.length > 0 ? (
              <div className="league-races-list">
                {leagueRaceSchedule.map((raceItem) => {
                  const isNext = raceItem.id === targetRace?.id;
                  return (
                    <div key={raceItem.id} className="league-race-item">
                      <div className="league-race-item-info">
                        <span className="gla-race-round">Round {raceItem.round}</span>
                        <strong className="league-race-item-name">{raceItem.name}</strong>
                        <span className="gla-race-meta">
                          {raceItem.country} ·{" "}
                          {raceItem.date
                            ? new Date(raceItem.date).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })
                            : "Date TBD"}
                        </span>
                      </div>
                      <div className="league-race-item-action">
                        <span className="gla-race-status is-upcoming">
                          {isNext ? "Next Up" : "Upcoming"}
                        </span>
                        {isNext ? (
                          <span className="league-econ-value league-race-countdown">
                            {countdownDisplay}
                          </span>
                        ) : (
                          <Link href={`/predict/${raceItem.id}`} className="league-race-link">
                            Predict
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="league-empty">
                This league covers the full 2026 season. New races appear here as soon as the calendar opens.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
