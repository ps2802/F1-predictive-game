"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";
import { findRaceById, useRaceCatalog } from "@/lib/raceCatalog";

type LeaguePreview = {
  id: string;
  race_id: string | null;
  name: string;
  type: "public" | "private";
  invite_code: string;
  entry_fee_usdc: number;
  prize_pool: number;
  member_count: number;
  max_users: number;
  is_active: boolean;
  minimum_stake_usdc: number;
  is_member: boolean;
};

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const { races } = useRaceCatalog();
  const code = ((params?.code as string) ?? "").toUpperCase();
  const [status, setStatus] = useState<
    "loading" | "login-required" | "ready" | "joining" | "done" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [league, setLeague] = useState<LeaguePreview | null>(null);
  const [stake, setStake] = useState(String(MINIMUM_LEAGUE_STAKE_USDC));

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Auth is unavailable in this environment.");
        }
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setStatus("login-required");
        }
        return;
      }

      const res = await fetch(`/api/leagues/${code}`, { cache: "no-store" });
      const data = await res.json();

      if (cancelled) {
        return;
      }

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Could not load this invite.");
        return;
      }

      const nextLeague = data.league as LeaguePreview;
      setLeague(nextLeague);
      setStake(String(nextLeague.minimum_stake_usdc));

      if (nextLeague.is_member) {
        setStatus("done");
        setMessage("You have already joined this league.");
        return;
      }

      if (!nextLeague.is_active) {
        setStatus("error");
        setMessage("This league is no longer active.");
        return;
      }

      setStatus("ready");
    }

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleJoin() {
    if (!league) return;

    setStatus("joining");
    setMessage("");

    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_code: code,
        stake_amount_usdc: Number(stake),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus("error");
      setMessage(data.error ?? "Could not join this league.");
      return;
    }

    setStatus("done");
    setMessage("Joined! Redirecting to league...");
    setTimeout(() => router.push(`/leagues/${data.leagueId}`), 1200);
  }

  const targetRace = findRaceById(races, league?.race_id ?? null);
  const minimumStake = league?.minimum_stake_usdc ?? MINIMUM_LEAGUE_STAKE_USDC;

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <div className="gla-content" style={{ maxWidth: "620px", paddingTop: "5rem" }}>
        <div className="league-join-box" style={{ marginTop: 0 }}>
          {(status === "loading" || status === "joining") && (
            <div style={{ textAlign: "center", padding: "2rem 0" }}>
              <div className="gl-spinner" />
              <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>
                {status === "joining" ? "Joining league..." : "Checking invite..."}
              </p>
            </div>
          )}

          {status === "login-required" && (
            <>
              <h1 className="gla-page-title">Sign in to join this league</h1>
              <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>
                Invite code {code}
              </p>
              <div className="wallet-action-row" style={{ marginTop: "1.5rem" }}>
                <Link href={`/login?redirect=/join/${code}`} className="gla-race-btn">
                  Continue to Login
                </Link>
                <Link href="/login" className="gla-race-btn league-secondary-btn">
                  Back to Login
                </Link>
              </div>
            </>
          )}

          {status === "ready" && league && (
            <>
              <p className="gla-race-round">Invite Code {league.invite_code}</p>
              <h1 className="gla-page-title" style={{ marginTop: "0.5rem" }}>
                {league.name}
              </h1>
              <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>
                {league.member_count}/{league.max_users} members
                {targetRace ? ` · ${targetRace.name}` : ""}
              </p>

              <div className="league-economics" style={{ marginTop: "1.5rem" }}>
                <div className="league-econ-card">
                  <span className="league-econ-value">
                    ${Number(league.prize_pool).toFixed(2)}
                  </span>
                  <span className="league-econ-label">Prize Pool</span>
                </div>
                <div className="league-econ-card">
                  <span className="league-econ-value">
                    ${Number(league.entry_fee_usdc).toFixed(0)}
                  </span>
                  <span className="league-econ-label">League Minimum</span>
                </div>
                <div className="league-econ-card">
                  <span className="league-econ-value">{league.type}</span>
                  <span className="league-econ-label">League Type</span>
                </div>
              </div>

              <div className="league-join-form" style={{ marginTop: "1.5rem" }}>
                <input
                  className="league-join-input"
                  type="number"
                  min={minimumStake}
                  step="1"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  placeholder="Stake in USDC"
                />
                <button
                  type="button"
                  className="gla-race-btn"
                  disabled={Number(stake) < minimumStake}
                  onClick={handleJoin}
                >
                  Join League
                </button>
              </div>

              <p style={{ color: "rgba(255,255,255,0.6)", marginTop: "1rem" }}>
                Enter with at least ${minimumStake} USDC. You can stake more if you want
                a larger position in this prize pool.
              </p>
            </>
          )}

          {(status === "error" || status === "done") && (
            <>
              <h1 className="gla-page-title">
                {status === "done" ? "League Ready" : "Invite unavailable"}
              </h1>
              <p
                className="gla-page-sub"
                style={{
                  marginTop: "0.75rem",
                  color: status === "done" ? "#4caf50" : "var(--gl-red)",
                }}
              >
                {message}
              </p>
              <div className="wallet-action-row" style={{ marginTop: "1.5rem" }}>
                {league && (
                  <Link href={`/leagues/${league.id}`} className="gla-race-btn">
                    Open League
                  </Link>
                )}
                <Link href="/leagues" className="gla-race-btn league-secondary-btn">
                  Browse Leagues
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
