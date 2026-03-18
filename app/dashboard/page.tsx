"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { races } from "@/lib/races";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function Navbar() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="gla-nav">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/gridlock logo - transparent.png"
        alt="Gridlock"
        className="gla-nav-logo"
        draggable={false}
      />
      <div className="gla-nav-right">
        <button className="gla-nav-link" onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}

export default function DashboardPage() {
  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <Navbar />

      <div className="gla-content">
        <p className="gla-page-title">2026 Season</p>
        <p className="gla-page-sub">
          {races.length} rounds · select a race to submit your podium prediction
        </p>

        <div className="gla-race-grid">
          {races.map((race) => {
            const isClosed = race.status === "closed";
            return (
              <article className="gla-race-card" key={race.id}>
                <p className="gla-race-round">Round {race.round}</p>
                <h2 className="gla-race-name">{race.name}</h2>
                <p className="gla-race-meta">
                  {race.country}
                  <span className="gla-race-sep" />
                  {new Date(race.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
                <span className={`gla-race-status ${isClosed ? "is-closed" : "is-upcoming"}`}>
                  {isClosed ? "Locked" : "Open"}
                </span>
                {isClosed ? (
                  <span className="gla-race-btn is-disabled">Locked</span>
                ) : (
                  <Link className="gla-race-btn" href={`/predict/${race.id}`}>
                    Predict
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
