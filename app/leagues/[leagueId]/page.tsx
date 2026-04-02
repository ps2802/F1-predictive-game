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

type Membership = {
  stake_amount_usdc: number;
};

type ActiveTab = "leaderboard" | "predictions" | "races";

const DEFAULT_PAYOUT_TIERS = [
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
];

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

function hasMissingStakeColumn(message: string | undefined): boolean {
  if (!message) return false;
  return (
    /Could not find the 'stake_amount_usdc' column of 'league_members'/i.test(message) ||
    /column\s+league_members\.stake_amount_usdc\s+does not exist/i.test(message) ||
    /column\s+"stake_amount_usdc"\s+of relation\s+"league_members"\s+does not exist/i.test(message)
  );
}

export default function LeaguePage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<MemberScore[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [joinStake, setJoinStake] = useState("5");
  const [joining, setJoining] = useState(false);
  const [addingStake, setAddingStake] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [stakeSuccess, setStakeSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState("TBD");
  const [nextRacePredStatus, setNextRacePredStatus] = useState<"active" | "draft" | "none">("none");
  const [navProfile, setNavProfile] = useState<NavProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("leaderboard");

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getRaceCountdown(league?.race_id ?? null));
    }, 60_000);
    return () => clearInterval(interval);
  }, [league?.race_id]);

  useEffect(() => {
    async function load() {
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
      setJoinStake(String(Number(leagueData.entry_fee_usdc ?? 5)));
      setCountdown(getRaceCountdown(leagueData.race_id));

      let membershipResult = await supabase
        .from("league_members")
        .select("id, stake_amount_usdc")
        .eq("league_id", leagueId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membershipResult.error && hasMissingStakeColumn(membershipResult.error.message)) {
        membershipResult = await supabase
          .from("league_members")
          .select("id")
          .eq("league_id", leagueId)
          .eq("user_id", user.id)
          .maybeSingle();
      }

      if (!membershipResult.data) {
        setActiveTab("predictions");
      }

      if (membershipResult.data) {
        const { data: transactionsData } = await supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", user.id)
          .eq("reference_id", leagueId)
          .eq("type", "entry_fee");

        const totalStakeFromTransactions = (transactionsData ?? []).reduce(
          (sum, transaction) => sum + Math.abs(Number(transaction.amount ?? 0)),
          0
        );

        setMembership({
          stake_amount_usdc:
            totalStakeFromTransactions > 0
              ? totalStakeFromTransactions
              : Number((membershipResult.data as { stake_amount_usdc?: number | null }).stake_amount_usdc ?? leagueData.entry_fee_usdc ?? 0),
        });
      } else {
        setMembership(null);
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

      if (leagueData.race_id && user) {
        const { data: pred } = await supabase
          .from("predictions")
          .select("status")
          .eq("race_id", leagueData.race_id)
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

  async function handleJoinLeague() {
    if (!league) return;
    setJoining(true);
    setJoinError("");
    setStakeSuccess("");

    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_code: league.invite_code,
        stake_amount_usdc: Number(joinStake),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setJoinError(data.error ?? "Failed to join league.");
      setJoining(false);
      return;
    }

    setMembership({ stake_amount_usdc: Number(data.stakeAmountUsdc ?? joinStake) });
    setLeague((prev) =>
      prev
        ? {
            ...prev,
            prize_pool: Number(prev.prize_pool ?? 0) + Number(data.stakeAmountUsdc ?? joinStake) * 0.9,
            member_count: prev.member_count + 1,
          }
        : prev
    );
    setJoining(false);
    router.refresh();
  }

  async function handleIncreaseStake() {
    if (!league || !membership) return;
    setAddingStake(true);
    setJoinError("");
    setStakeSuccess("");

    const res = await fetch("/api/leagues/stake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league_id: league.id,
        additional_stake_usdc: Number(joinStake),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setJoinError(data.error ?? "Failed to increase stake.");
      setAddingStake(false);
      return;
    }

    const addedAmount = Number(data.addedStakeUsdc ?? joinStake);
    setMembership({
      stake_amount_usdc: Number(membership.stake_amount_usdc ?? 0) + addedAmount,
    });
    setLeague((prev) =>
      prev
        ? {
            ...prev,
            prize_pool: Number(prev.prize_pool ?? 0) + addedAmount * 0.9,
          }
        : prev
    );
    setStakeSuccess(`Added $${addedAmount.toFixed(2)} USDC to the prize pool.`);
    setAddingStake(false);
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
  const targetRace = races.find((race) => race.id === league.race_id);
  const isSkillWeighted = league.payout_model === "skill_weighted";
  const countdownDisplay = countdown === "TBD" ? "Schedule Soon" : countdown;
  const stakeWindowClosed = countdown === "Locked";
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
            {league.type === "private" && membership && (
              <button
                className="gla-race-btn"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.12)" }}
                onClick={() => {
                  const link = `${window.location.origin}/join/${league.invite_code}`;
                  navigator.clipboard.writeText(link).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? "Copied!" : "Share →"}
              </button>
            )}
            {targetRace && membership && (
              <Link href={`/predict/${targetRace.id}`} className="gla-race-btn">
                {nextRacePredStatus === "none" ? "Make Picks →" : nextRacePredStatus === "draft" ? "Finish Picks →" : "Edit Picks →"}
              </Link>
            )}
          </div>
        </div>

        {/* Join CTA banner for non-members */}
        {!membership && !loading && (
          <div className="league-join-cta-banner">
            <p>You&apos;re not in this league yet.</p>
            <button className="gla-race-btn" onClick={() => setActiveTab("predictions")}>
              Join &amp; Stake →
            </button>
          </div>
        )}

        {/* Stats row */}
        <div className="league-stats-row">
          <div className="league-stats-card">
            <span className="league-stats-label">Prize Pool</span>
            <span className="league-stats-value">${pool > 0 ? pool.toFixed(2) : "0"}</span>
          </div>
          <div className="league-stats-card">
            <span className="league-stats-label">Participants</span>
            <span className="league-stats-value">{league.member_count}</span>
          </div>
          <div className="league-stats-card">
            <span className="league-stats-label">Races Left</span>
            <span className="league-stats-value">{racesLeft}</span>
          </div>
        </div>

        {/* Private league invite */}
        {league.type === "private" && membership && (
          <div className="league-invite-box" style={{ marginBottom: "1.5rem" }}>
            <span className="league-invite-label">Invite Code</span>
            <code className="league-invite-code">{league.invite_code}</code>
            <button className="league-copy-btn" onClick={copyInvite}>
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
            <div className="lb-table" style={{ marginTop: "1.5rem" }}>
              <div className="lb-header">
                <span>Rank</span>
                <span>Driver</span>
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
          </div>
        )}

        {/* Predictions tab */}
        {activeTab === "predictions" && (
          <div style={{ marginTop: "1.5rem" }}>
            {/* Membership / join section */}
            {!membership ? (
              <div className="league-join-box">
                <h3 className="league-join-title">Join This League</h3>
                <div className="league-join-form">
                  <input
                    className="league-join-input"
                    type="number"
                    min={Number(league.entry_fee_usdc)}
                    step="1"
                    value={joinStake}
                    onChange={(e) => setJoinStake(e.target.value)}
                    placeholder="Stake in USDC"
                  />
                  <button
                    type="button"
                    className="gla-race-btn"
                    disabled={joining || Number(joinStake) < Number(league.entry_fee_usdc)}
                    onClick={handleJoinLeague}
                  >
                    {joining ? "Joining..." : "Join League"}
                  </button>
                </div>
                {joinError && <p className="league-join-error">{joinError}</p>}
              </div>
            ) : (
              <div className="league-join-box" style={{ marginBottom: "1.5rem" }}>
                <h3 className="league-join-title">Your Entry</h3>
                <p className="league-entry-summary">
                  You&apos;re entered with ${Number(membership.stake_amount_usdc).toFixed(2)} USDC.
                </p>
                {!stakeWindowClosed ? (
                  <>
                    <div className="league-join-form">
                      <input
                        className="league-join-input"
                        type="number"
                        min="1"
                        step="1"
                        value={joinStake}
                        onChange={(e) => setJoinStake(e.target.value)}
                        placeholder="Add more USDC"
                      />
                      <button
                        type="button"
                        className="gla-race-btn"
                        disabled={addingStake || Number(joinStake) <= 0}
                        onClick={handleIncreaseStake}
                      >
                        {addingStake ? "Adding..." : "Add to Prize Pool"}
                      </button>
                    </div>
                    <p className="league-entry-note">
                      Increase your stake any time before the race lock.
                    </p>
                  </>
                ) : (
                  <p className="league-entry-note">
                    Stake window closed — this league has reached its lock window.
                  </p>
                )}
                {joinError && <p className="league-join-error">{joinError}</p>}
                {stakeSuccess && <p className="league-join-success">{stakeSuccess}</p>}
              </div>
            )}

            {/* Prediction CTA */}
            {targetRace && (
              <div className="league-predict-cta">
                <div className="league-predict-cta-text">
                  {nextRacePredStatus === "active" ? (
                    <>
                      <strong>Your picks for {targetRace.name} are active.</strong>
                      <span>They&apos;ll score once the race is settled.</span>
                    </>
                  ) : nextRacePredStatus === "draft" ? (
                    <>
                      <strong>Picks saved — not entered yet.</strong>
                      <span>Join this league to activate your prediction for {targetRace.name}.</span>
                    </>
                  ) : (
                    <>
                      <strong>No prediction yet for {targetRace.name}.</strong>
                      <span>Your prediction sheet powers the global board and this league once the race settles.</span>
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

            {/* Payout overview */}
            {(pool > 0 || league.entry_fee_usdc > 0) && (
              <div className="league-payout-section" style={{ marginTop: "2rem" }}>
                <div className="league-payout-header">
                  <h3 className="league-section-title">Payout Distribution</h3>
                  <span className="league-payout-mode">
                    {isSkillWeighted ? "Score Weighted" : "Fixed Tiers"}
                  </span>
                </div>
                {isSkillWeighted ? (
                  <p className="league-payout-copy" style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.5)", marginTop: "0.5rem" }}>
                    Payouts scale with performance. Higher-scoring players take a larger share of the pool.
                  </p>
                ) : (
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
                )}
              </div>
            )}
          </div>
        )}

        {/* Races tab */}
        {activeTab === "races" && (
          <div style={{ marginTop: "1.5rem" }}>
            {targetRace ? (
              <div className="league-races-list">
                <div className="league-race-item">
                  <div className="league-race-item-info">
                    <span className="gla-race-round">Round {targetRace.round}</span>
                    <strong className="league-race-item-name">{targetRace.name}</strong>
                    <span className="gla-race-meta">
                      {targetRace.country} ·{" "}
                      {targetRace.date
                        ? new Date(targetRace.date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "Date TBD"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                    <span className="gla-race-status is-upcoming">Upcoming</span>
                    <span className="league-econ-value" style={{ fontSize: "1rem" }}>
                      {countdownDisplay}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="league-empty">
                This league covers the full 2026 season — {races.filter((r) => r.status === "upcoming").length} races remaining.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
