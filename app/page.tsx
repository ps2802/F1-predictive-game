"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { races } from "@/lib/races";

type PublicLeague = {
  id: string;
  name: string;
  entry_fee_usdc: number;
  member_count: number;
  max_users: number;
  prize_pool: number;
};

function getNextRace() {
  const now = new Date();
  return races.find((r) => new Date(r.date) >= now) ?? races[races.length - 1];
}

function getCountdown(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "Race day";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m`;
}

export default function LandingPage() {
  const [publicLeagues, setPublicLeagues] = useState<PublicLeague[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const nextRace = getNextRace();
  const [countdown, setCountdown] = useState(() => getCountdown(nextRace.date));

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getCountdown(nextRace.date));
    }, 60_000);
    return () => clearInterval(interval);
  }, [nextRace.date]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user);
    });

    // Load public leagues (no auth required — uses anon key)
    supabase
      .from("leagues")
      .select("id, name, entry_fee_usdc, member_count, max_users, prize_pool")
      .eq("type", "public")
      .eq("is_active", true)
      .order("member_count", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (data) setPublicLeagues(data);
      });
  }, []);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />

      {/* Nav */}
      <nav className="gla-nav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="gla-nav-logo"
          draggable={false}
        />
        <div className="gla-nav-right">
          {isAuthenticated ? (
            <Link className="gla-nav-link" href="/dashboard">
              Dashboard
            </Link>
          ) : (
            <Link className="gla-nav-link" href="/login">
              Sign In
            </Link>
          )}
        </div>
      </nav>

      <div className="gla-content">
        {/* Hero — Next Race */}
        <section className="landing-hero">
          <p className="landing-round">Round {nextRace.round} · {nextRace.country}</p>
          <h1 className="landing-race-name">{nextRace.name}</h1>
          <div className="landing-countdown">
            <span className="landing-countdown-label">Lights out in</span>
            <span className="landing-countdown-value">{countdown || "—"}</span>
          </div>
          <div className="landing-ctas">
            <Link href={`/predict/${nextRace.id}`} className="landing-cta-primary">
              Make Your Predictions
            </Link>
            <Link href={isAuthenticated ? "/leagues/create" : `/login?redirect=/leagues/create`} className="landing-cta-secondary">
              Create a League
            </Link>
          </div>
        </section>

        {/* Season Stats */}
        <section className="landing-stats">
          <div className="landing-stat">
            <span className="landing-stat-value">{races.length}</span>
            <span className="landing-stat-label">Rounds</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">20</span>
            <span className="landing-stat-label">Drivers</span>
          </div>
          <div className="landing-stat">
            <span className="landing-stat-value">1</span>
            <span className="landing-stat-label">Champion</span>
          </div>
        </section>

        {/* How it works */}
        <section className="landing-section">
          <h2 className="landing-section-title">How It Works</h2>
          <div className="landing-steps-grid">
            <div className="landing-step-card">
              <span className="landing-step-num">01</span>
              <h3>Predict</h3>
              <p>Call qualifying, race podium, and chaos events before lights out.</p>
            </div>
            <div className="landing-step-card">
              <span className="landing-step-num">02</span>
              <h3>Join a League</h3>
              <p>Compete in public pools or create a private league with friends.</p>
            </div>
            <div className="landing-step-card">
              <span className="landing-step-num">03</span>
              <h3>Win</h3>
              <p>Score points with anti-herd multipliers. Bold picks pay more.</p>
            </div>
          </div>
        </section>

        {/* Public Leagues */}
        {publicLeagues.length > 0 && (
          <section className="landing-section">
            <h2 className="landing-section-title">Open Leagues</h2>
            <div className="league-grid">
              {publicLeagues.map((l) => (
                <Link
                  key={l.id}
                  href={isAuthenticated ? `/leagues/${l.id}` : `/login?redirect=/leagues/${l.id}`}
                  className="league-card"
                >
                  <div className="league-card-header">
                    <span className="league-card-name">{l.name}</span>
                    <span className="league-card-type public">public</span>
                  </div>
                  <div className="league-card-stats">
                    <span>{l.member_count}/{l.max_users} members</span>
                    {l.entry_fee_usdc > 0 && (
                      <span className="league-card-fee">${l.entry_fee_usdc} USDC</span>
                    )}
                    {l.prize_pool > 0 && (
                      <span className="league-card-pool">${l.prize_pool} pool</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <Link
                href={isAuthenticated ? "/leagues" : "/login?redirect=/leagues"}
                className="landing-cta-secondary"
              >
                View All Leagues
              </Link>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="landing-footer">
          <p>Gridlock · 2026 Season · joingridlock.com</p>
        </footer>
      </div>
    </div>
  );
}
