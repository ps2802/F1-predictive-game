"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics";
import { AppNav } from "@/app/components/AppNav";

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

type SortOption = "newest" | "members" | "prize";

/** Compute prize pool from member count × entry fee if the stored value is 0. */
function computePrizePool(league: League): number {
  if (league.prize_pool > 0) return league.prize_pool;
  return league.member_count * league.entry_fee_usdc;
}

export default function LeaguesPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

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

  const myLeagues = leagues.filter((l) => l.is_member);

  const filteredPublicLeagues = leagues
    .filter((l) => l.type === "public" && !l.is_member)
    .filter((l) => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "members") return b.member_count - a.member_count;
      if (sortBy === "prize") return b.prize_pool - a.prize_pool;
      return 0; // "newest" — API already orders by created_at desc
    });

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

        {/* Public leagues with search + sort */}
        <section className="league-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
            <h2 className="league-section-title" style={{ margin: 0 }}>
              Public Leagues
              {filteredPublicLeagues.length > 0 && (
                <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", fontWeight: 400, color: "rgba(255,255,255,0.4)" }}>
                  {filteredPublicLeagues.length} found
                </span>
              )}
            </h2>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="league-join-input"
                style={{ maxWidth: "180px", padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                placeholder="Search leagues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {(["newest", "members", "prize"] as SortOption[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSortBy(opt)}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: sortBy === opt ? "var(--gl-red)" : "transparent",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: sortBy === opt ? 700 : 400,
                  }}
                >
                  {opt === "newest" ? "Newest" : opt === "members" ? "Most Members" : "Prize Pool"}
                </button>
              ))}
            </div>
          </div>
          {filteredPublicLeagues.length === 0 ? (
            <p className="league-empty">
              {searchQuery ? `No leagues matching "${searchQuery}"` : "No public leagues yet. Create one!"}
            </p>
          ) : (
            <div className="league-grid">
              {filteredPublicLeagues.map((l) => (
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
  const prizePool = computePrizePool(league);
  const myContribution = isMember && league.entry_fee_usdc > 0 ? league.entry_fee_usdc : 0;

  return (
    <Link href={`/leagues/${league.id}`} className="league-card">
      <div className="league-card-header">
        <span className="league-card-name">{league.name}</span>
        <span className={`league-card-type ${league.type}`}>{league.type}</span>
      </div>
      <div className="league-card-stats">
        <span>{league.member_count}/{league.max_users} members</span>
        {/* Entry fee: show "Free" for 0, otherwise show USDC amount */}
        {league.entry_fee_usdc === 0 ? (
          <span className="league-card-fee league-card-fee--free">Free</span>
        ) : (
          <span className="league-card-fee">${league.entry_fee_usdc} USDC entry</span>
        )}
      </div>
      {/* Prize pool shown prominently when non-zero */}
      {prizePool > 0 && (
        <div className="league-card-prize">
          <span className="league-card-prize-label">Prize Pool</span>
          <span className="league-card-prize-amount">${prizePool.toFixed(2)} USDC</span>
        </div>
      )}
      {/* My contribution for joined paid leagues */}
      {myContribution > 0 && (
        <div className="league-card-contribution">
          My contribution: ${myContribution.toFixed(2)} USDC
        </div>
      )}
      {isMember && <span className="league-card-member-badge">✓ Joined</span>}
    </Link>
  );
}

