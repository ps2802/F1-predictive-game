'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { races } from '@/lib/races';

// Qualifying is typically Saturday — 2 days before the Sunday race date.
// We approximate qualifying as race_date - 2 days at 14:00 UTC.
const QUALIFYING_OFFSET_MS = 2 * 24 * 60 * 60 * 1000;
const QUALIFYING_HOUR_UTC = 14;

function getQualifyingDate(raceDateStr: string): Date {
  const raceDate = new Date(raceDateStr);
  const qualifying = new Date(
    raceDate.getTime() - QUALIFYING_OFFSET_MS
  );
  qualifying.setUTCHours(QUALIFYING_HOUR_UTC, 0, 0, 0);
  return qualifying;
}

function getNextRace() {
  const now = new Date();
  return races.find((r) => getQualifyingDate(r.date) > now) ?? null;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calcTimeLeft(target: Date): TimeLeft {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function NextRaceCountdown(): React.ReactElement | null {
  const nextRace = getNextRace();
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    if (!nextRace) return;
    const target = getQualifyingDate(nextRace.date);

    setTimeLeft(calcTimeLeft(target));

    const id = setInterval(() => {
      setTimeLeft(calcTimeLeft(target));
    }, 1000);
    return () => clearInterval(id);
  }, [nextRace]);

  if (!nextRace || !timeLeft) return null;

  const qualifyingDate = getQualifyingDate(nextRace.date);
  const dateLabel = qualifyingDate.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <div className="home-countdown-box">
      <p className="home-countdown-label">
        <span className="home-countdown-dot" aria-hidden="true" />
        NEXT RACE — QUALIFYING LOCKS IN
      </p>
      <p className="home-countdown-race">{nextRace.name}</p>
      <p className="home-countdown-date">{dateLabel} · Round {nextRace.round}</p>
      <div className="home-countdown-timer" aria-live="polite" aria-atomic="true">
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.days)}</span>
          <span className="home-countdown-u">Days</span>
        </div>
        <span className="home-countdown-sep" aria-hidden="true">:</span>
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.hours)}</span>
          <span className="home-countdown-u">Hrs</span>
        </div>
        <span className="home-countdown-sep" aria-hidden="true">:</span>
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.minutes)}</span>
          <span className="home-countdown-u">Min</span>
        </div>
        <span className="home-countdown-sep" aria-hidden="true">:</span>
        <div className="home-countdown-unit">
          <span className="home-countdown-n">{pad(timeLeft.seconds)}</span>
          <span className="home-countdown-u">Sec</span>
        </div>
      </div>
    </div>
  );
}

export default function RootPage(): React.ReactElement {
  return (
    <div className="home-root">
      {/* Speed stripe */}
      <div className="home-stripe" aria-hidden="true" />

      {/* Nav */}
      <nav className="home-nav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="home-nav-logo"
          draggable={false}
        />
        <Link href="/login" className="home-nav-cta">
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <p className="home-hero-eyebrow">
            <span className="home-hero-dot" aria-hidden="true" />
            2026 F1 SEASON · LIVE NOW
          </p>

          <h1 className="home-hero-h1">
            Read the race.<br />
            Call the podium.<br />
            <em className="home-hero-em">Own the grid.</em>
          </h1>

          <p className="home-hero-sub">
            Predict first, second, and third for every 2026 Formula 1 race.
            Score points. Climb the leaderboard. Beat your rivals.
            24 rounds. 20 drivers. One champion.
          </p>

          <NextRaceCountdown />

          <div className="home-hero-actions">
            <Link href="/login" className="home-cta-primary">
              Enter the Grid
            </Link>
          </div>

          <div className="home-hero-stats">
            <div className="home-stat">
              <span className="home-stat-n">24</span>
              <span className="home-stat-l">Rounds</span>
            </div>
            <div className="home-stat-div" aria-hidden="true" />
            <div className="home-stat">
              <span className="home-stat-n">20</span>
              <span className="home-stat-l">Drivers</span>
            </div>
            <div className="home-stat-div" aria-hidden="true" />
            <div className="home-stat">
              <span className="home-stat-n">3</span>
              <span className="home-stat-l">pts exact</span>
            </div>
            <div className="home-stat-div" aria-hidden="true" />
            <div className="home-stat">
              <span className="home-stat-n">1</span>
              <span className="home-stat-l">pt podium</span>
            </div>
          </div>
        </div>

        {/* Driver hero visual */}
        <div className="home-hero-visual" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gridlock f1 driver .png"
            alt=""
            className="home-hero-driver"
            draggable={false}
          />
          <div className="home-hero-img-overlay" />
          <div className="home-hero-vstrip" />
        </div>
      </section>

      {/* How it works */}
      <section className="home-how">
        <div className="home-how-inner">
          <h2 className="home-how-title">How Gridlock works</h2>
          <div className="home-how-steps">
            <div className="home-step">
              <span className="home-step-n">01</span>
              <h3 className="home-step-h">Pick the podium</h3>
              <p className="home-step-p">
                Before qualifying locks, call P1, P2, and P3 for the race.
                All three drivers must differ — no hedging.
              </p>
            </div>
            <div className="home-step">
              <span className="home-step-n">02</span>
              <h3 className="home-step-h">Score your prediction</h3>
              <p className="home-step-p">
                Exact position match scores 3 pts. Right driver, wrong position scores 1 pt.
                Every race is a fresh chance to move up.
              </p>
            </div>
            <div className="home-step">
              <span className="home-step-n">03</span>
              <h3 className="home-step-h">Climb the leaderboard</h3>
              <p className="home-step-p">
                Compete globally or create a private league to take on friends.
                Best cumulative score across the season wins.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p>© 2026 Gridlock · <a href="https://joingridlock.com" className="home-footer-link">joingridlock.com</a></p>
      </footer>
    </div>
  );
}
