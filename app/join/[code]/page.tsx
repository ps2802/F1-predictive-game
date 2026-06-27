"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { findRaceById, useRaceCatalog } from "@/lib/raceCatalog";

type LeaguePreview = {
  id: string;
  race_id: string | null;
  name: string;
  type: "public" | "private";
  member_count: number;
  max_users: number;
  is_member: boolean;
};

type JoinStatus =
  | "loading"
  | "login-required"
  | "ready"
  | "joining"
  | "done"
  | "error";

export default function JoinPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { races } = useRaceCatalog();
  const code = ((params?.code as string) ?? "").toUpperCase();
  const [status, setStatus] = useState<JoinStatus>("loading");
  const [message, setMessage] = useState("");
  const [league, setLeague] = useState<LeaguePreview | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite(): Promise<void> {
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

      if (nextLeague.is_member) {
        setStatus("done");
        setMessage("You're already in this league.");
        return;
      }

      setStatus("ready");
    }

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleJoin(): Promise<void> {
    if (!league) return;

    setStatus("joining");
    setMessage("");

    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: code }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus("error");
      setMessage(data.error ?? "Could not join this league.");
      return;
    }

    setStatus("done");
    setMessage("You're in. Loading the league...");
    setTimeout(() => router.push(`/leagues/${data.leagueId}`), 1200);
  }

  const targetRace = findRaceById(races, league?.race_id ?? null);

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
              <div className="league-action-row" style={{ marginTop: "1.5rem" }}>
                <Link href={`/?redirect=/join/${code}`} className="gla-race-btn">
                  Continue to Login
                </Link>
                <Link href="/" className="gla-race-btn league-secondary-btn">
                  Back to Login
                </Link>
              </div>
            </>
          )}

          {status === "ready" && league && (
            <>
              <p className="gla-race-round">Invite Code {code}</p>
              <h1 className="gla-page-title" style={{ marginTop: "0.5rem" }}>
                {league.name}
              </h1>
              <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>
                {league.member_count}/{league.max_users} members
                {targetRace ? ` · ${targetRace.name}` : ""}
              </p>

              <p style={{ color: "rgba(255,255,255,0.6)", marginTop: "1.25rem" }}>
                Predict the podium every race and climb the league table. No buy-in,
                no catch — just bragging rights.
              </p>

              <div className="league-join-form" style={{ marginTop: "1.5rem" }}>
                <button
                  type="button"
                  className="gla-race-btn"
                  onClick={handleJoin}
                  data-testid="league-join-submit-button"
                >
                  Join League
                </button>
              </div>
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
                  color: status === "done" ? "#00D2AA" : "var(--gl-red)",
                }}
                data-testid={status === "done" ? "league-join-success" : undefined}
              >
                {message}
              </p>
              <div className="league-action-row" style={{ marginTop: "1.5rem" }}>
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
