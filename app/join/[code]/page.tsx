"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MINIMUM_LEAGUE_STAKE_USDC } from "@/lib/gameRules";

// Handles invite links: /join/ABCD1234
export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string ?? "").toUpperCase();
  const [status, setStatus] = useState<"loading" | "ready" | "joining" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  const [stake, setStake] = useState(String(MINIMUM_LEAGUE_STAKE_USDC));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push(`/login?redirect=/join/${code}`);
        return;
      }
      setStatus("ready");
    });
  }, [code, router]);

  async function handleJoin() {
    setStatus("joining");
    const res = await fetch("/api/leagues/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invite_code: code,
        stake_amount_usdc: Number(stake),
      }),
    });
    const data = await res.json();

    if (res.ok) {
      setStatus("done");
      setMessage("Joined! Redirecting to league...");
      setTimeout(() => router.push(`/leagues/${data.leagueId}`), 1500);
    } else {
      setStatus("error");
      setMessage(data.error ?? "Could not join this league.");
    }
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
        {status === "loading" || status === "joining" ? (
          <>
            <div className="gl-spinner" />
            <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>
              {status === "joining" ? "Joining league..." : "Checking invite..."}
            </p>
          </>
        ) : status === "ready" ? (
          <>
            <h1 className="gla-page-title">Join League</h1>
            <p className="gla-page-sub" style={{ marginTop: "0.5rem" }}>
              Invite code {code}
            </p>
            <div className="league-join-form" style={{ justifyContent: "center", marginTop: "1.5rem" }}>
              <input
                className="league-join-input"
                type="number"
                min={MINIMUM_LEAGUE_STAKE_USDC}
                step="1"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Stake in USDC"
              />
              <button
                type="button"
                className="gla-race-btn"
                disabled={Number(stake) < MINIMUM_LEAGUE_STAKE_USDC}
                onClick={handleJoin}
              >
                Join
              </button>
            </div>
            <p style={{ color: "rgba(255,255,255,0.6)", marginTop: "1rem" }}>
              Minimum stake is ${MINIMUM_LEAGUE_STAKE_USDC} USDC.
            </p>
          </>
        ) : status === "done" ? (
          <p style={{ color: "#4caf50" }}>{message}</p>
        ) : (
          <p style={{ color: "var(--gl-red)" }}>{message}</p>
        )}
      </div>
    </div>
  );
}
