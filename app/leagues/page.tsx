"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";

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
};

export default function LeaguesPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");

  async function loadLeagues() {
    setLoadError("");
    const res = await fetch("/api/leagues");
    if (res.ok) {
      const data = await res.json();
      setLeagues(data.leagues ?? []);
    } else {
      setLoadError("Failed to load leagues. Please refresh.");
    }
    setLoading(false);
  }

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push("/login");
      else loadLeagues();
    });
  }, [router]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setJoinError("");
    setJoinSuccess("");

    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: joinCode }),
    });
    const data = await res.json();

    if (!res.ok) {
      setJoinError(data.error ?? "Failed to join league.");
    } else {
      track("league_joined", { league_id: data.leagueId });
      setJoinSuccess("Joined! Redirecting...");
      setJoinCode("");
      setTimeout(() => router.push(`/leagues/${data.leagueId}`), 1200);
    }
    setJoining(false);
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

  if (loadError) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav />
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <p style={{ fontSize: "2rem", marginBottom: "1rem" }}>⚠️</p>
          <h1 className="gla-page-title">Something went wrong</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>{loadError}</p>
          <button
            className="gla-race-btn"
            style={{ marginTop: "2rem" }}
            onClick={() => { setLoading(true); loadLeagues(); }}
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
      <AppNav />

      <div className="gla-content">
        <div className="league-page-header">
          <div>
            <p className="gla-page-title">Leagues</p>
            <p className="gla-page-sub">Compete with friends or the world</p>
          </div>
          <Link href="/leagues/create" className="gla-race-btn">
            + Create League
          </Link>
        </div>

        {/* Join by invite code */}
        <div className="league-join-box">
          <h3 className="league-join-title">Join Private League</h3>
          <form onSubmit={handleJoin} className="league-join-form">
            <input
              className="league-join-input"
              placeholder="Enter invite code (e.g. ABCD1234)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={10}
            />
            <button
              type="submit"
              className="gla-race-btn"
              disabled={joining || !joinCode.trim()}
            >
              {joining ? "Joining..." : "Join"}
            </button>
          </form>
          {joinError && <p className="league-join-error">{joinError}</p>}
          {joinSuccess && <p className="league-join-success">{joinSuccess}</p>}
        </div>

        {/* My leagues */}
        {myLeagues.length > 0 && (
          <section className="league-section">
            <h2 className="league-section-title">My Leagues</h2>
            <div className="league-grid">
              {myLeagues.map((l) => (
                <LeagueCard key={l.id} league={l} isMember />
              ))}
            </div>
          </section>
        )}

        {/* Public leagues */}
        <section className="league-section">
          <h2 className="league-section-title">Public Leagues</h2>
          {publicLeagues.length === 0 ? (
            <p className="league-empty">No public leagues yet. Create one!</p>
          ) : (
            <div className="league-grid">
              {publicLeagues.map((l) => (
                <LeagueCard key={l.id} league={l} isMember={false} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function LeagueCard({ league, isMember }: { league: League; isMember: boolean }) {
  return (
    <Link href={`/leagues/${league.id}`} className="league-card">
      <div className="league-card-header">
        <span className="league-card-name">{league.name}</span>
        <span className={`league-card-type ${league.type}`}>{league.type}</span>
      </div>
      <div className="league-card-stats">
        <span>{league.member_count}/{league.max_users} members</span>
        {league.entry_fee_usdc > 0 && (
          <span className="league-card-fee">${league.entry_fee_usdc} USDC</span>
        )}
        {league.prize_pool > 0 && (
          <span className="league-card-pool">🏆 ${league.prize_pool}</span>
        )}
      </div>
      {isMember && <span className="league-card-member-badge">✓ Joined</span>}
    </Link>
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
