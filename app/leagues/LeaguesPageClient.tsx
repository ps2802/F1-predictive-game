"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import { findRaceById, useRaceCatalog } from "@/lib/raceCatalog";

type League = {
  id: string;
  name: string;
  type: "public" | "private" | "global";
  entry_fee_usdc: number;
  member_count: number;
  max_users: number;
  invite_code: string;
  is_member: boolean;
  prize_pool: number;
  race_id: string | null;
};

type NavProfile = {
  username: string | null;
  is_admin: boolean;
};

type LeaguesPageClientProps = {
  initialRaceId: string | null;
};

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LeaguesPageClient({
  initialRaceId,
}: LeaguesPageClientProps) {
  const router = useRouter();
  const { races, loading: racesLoading } = useRaceCatalog();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(hasSupabaseEnv);
  const [loadError, setLoadError] = useState(
    hasSupabaseEnv ? "" : "Live league data is unavailable in this environment."
  );
  const [joinCode, setJoinCode] = useState("");
  const [joinStake, setJoinStake] = useState(String(MINIMUM_LEAGUE_STAKE_USDC));
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [joinedLeagueId, setJoinedLeagueId] = useState<string | null>(null);
  const [navProfile, setNavProfile] = useState<NavProfile | null>(null);

  async function loadLeagues(activeRaceId: string | null) {
    setLoadError("");
    const res = await fetch(
      activeRaceId ? `/api/leagues?raceId=${activeRaceId}` : "/api/leagues"
    );
    if (res.ok) {
      const data = await res.json();
      setLeagues(data.leagues ?? []);
    } else {
      setLoadError("Failed to load leagues. Please refresh.");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!hasSupabaseEnv) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }

      supabase
        .from("profiles")
        .select("username, is_admin")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setNavProfile(data));

      void loadLeagues(initialRaceId);
    });
  }, [initialRaceId, router]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setJoinError("");
    setJoinSuccess("");
    track("league_join_attempted", {
      invite_code_present: Boolean(joinCode.trim()),
      race_id: initialRaceId ?? undefined,
      stake_amount_usdc: Number(joinStake),
    });

    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_code: joinCode,
        stake_amount_usdc: Number(joinStake),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      track("league_join_failed", {
        error_category: res.status,
        race_id: initialRaceId ?? undefined,
        stake_amount_usdc: Number(joinStake),
      });
      setJoinError(data.error ?? "Failed to join league.");
    } else {
      track(
        "league_joined",
        {
          league_id: data.leagueId,
          race_id: initialRaceId ?? undefined,
          stake_amount_usdc: Number(data.stakeAmountUsdc ?? joinStake),
        },
        { send_to_posthog: false, send_to_clarity: true }
      );
      setJoinedLeagueId(data.leagueId);
      setJoinSuccess(
        `Joined with $${Number(data.stakeAmountUsdc ?? joinStake).toFixed(2)} USDC.`
      );
      setJoinCode("");
      void loadLeagues(initialRaceId);
    }
    setJoining(false);
  }

  if (loading || racesLoading) {
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
        <AppNav profile={navProfile} />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <p style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</p>
          <h1 className="gla-page-title">Something went wrong</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>
            {loadError}
          </p>
          <button
            className="gla-race-btn"
            style={{ marginTop: "2rem" }}
            onClick={() => {
              setLoading(true);
              void loadLeagues(initialRaceId);
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const publicLeagues = leagues.filter((l) => l.type === "public" && !l.is_member);
  const myLeagues = leagues.filter((l) => l.is_member);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={navProfile} />

      <div className="gla-content">
        <div className="league-page-header">
          <div>
            <p className="gla-page-title">Leagues</p>
            <p className="gla-page-sub">
              {initialRaceId
                ? `Race contests for ${
                    findRaceById(races, initialRaceId)?.name ?? "this race"
                  }`
                : "Compete with friends or the world"}
            </p>
          </div>
          <Link
            href={initialRaceId ? `/leagues/create?raceId=${initialRaceId}` : "/leagues/create"}
            className="gla-race-btn"
          >
            + Create League
          </Link>
        </div>

        <div className="league-join-box">
          <h3 className="league-join-title">Join Private League</h3>
          <form onSubmit={handleJoin} className="league-join-form">
            <input
              className="league-join-input"
              placeholder="Enter invite code (e.g. ABCD1234)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              data-clarity-mask="true"
              maxLength={10}
            />
            <input
              className="league-join-input"
              type="number"
              min={MINIMUM_LEAGUE_STAKE_USDC}
              step="1"
              value={joinStake}
              onChange={(e) => setJoinStake(e.target.value)}
              placeholder="Stake in USDC"
            />
            <button
              type="submit"
              className="gla-race-btn"
              disabled={
                joining ||
                !joinCode.trim() ||
                Number(joinStake) < MINIMUM_LEAGUE_STAKE_USDC
              }
            >
              {joining ? "Joining..." : "Join"}
            </button>
          </form>
          <p className="league-empty" style={{ marginTop: "0.75rem" }}>
            Minimum stake is ${MINIMUM_LEAGUE_STAKE_USDC} USDC. Your chosen stake
            joins that league&apos;s prize pool after fees.
          </p>
          {joinError && <p className="league-join-error">{joinError}</p>}
          {joinSuccess && <p className="league-join-success">{joinSuccess}</p>}
          {joinedLeagueId && (
            <div className="league-join-actions">
              <Link href={`/leagues/${joinedLeagueId}`} className="gla-race-btn">
                Open League
              </Link>
              <button
                type="button"
                className="gla-race-btn league-secondary-btn"
                onClick={() => setJoinedLeagueId(null)}
              >
                Stay Here
              </button>
            </div>
          )}
        </div>

        {myLeagues.length > 0 && (
          <section className="league-section">
            <h2 className="league-section-title">My Leagues</h2>
            <div className="league-grid">
              {myLeagues.map((league) => (
                <LeagueCard key={league.id} league={league} isMember races={races} />
              ))}
            </div>
          </section>
        )}

        <section className="league-section">
          <h2 className="league-section-title">Public Leagues</h2>
          {publicLeagues.length === 0 ? (
            <p className="league-empty">No public leagues yet. Create one!</p>
          ) : (
            <div className="league-grid">
              {publicLeagues.map((league) => (
                <LeagueCard
                  key={league.id}
                  league={league}
                  isMember={false}
                  races={races}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function LeagueCard({
  league,
  isMember,
  races,
}: {
  league: League;
  isMember: boolean;
  races: ReturnType<typeof useRaceCatalog>["races"];
}) {
  const leagueRace = findRaceById(races, league.race_id);

  return (
    <Link href={`/leagues/${league.id}`} className="league-card">
      <div className="league-card-header">
        <span className="league-card-name">{league.name}</span>
        <span className={`league-card-type ${league.type}`}>{league.type}</span>
      </div>
      <div className="league-card-stats">
        <span>
          {league.member_count}/{league.max_users} members
        </span>
        {leagueRace && <span>{leagueRace.name}</span>}
        <span>${Number(league.entry_fee_usdc).toFixed(0)} min stake</span>
      </div>
      <div className="league-card-footer">
        <span className="league-card-pool">
          ${Number(league.prize_pool).toFixed(2)} prize pool
        </span>
        <span className={`league-card-cta${isMember ? " is-member" : ""}`}>
          {isMember ? "View League" : "Join League"}
        </span>
      </div>
    </Link>
  );
}
