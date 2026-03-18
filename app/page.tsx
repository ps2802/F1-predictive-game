"use client";

import { useState } from "react";
import Image from "next/image";

// ── Inline SVG logo ──────────────────────────────────────────────────────────
function GridlockLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 480 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Gridlock"
    >
      <path
        d="M 28 210 L 72 105 Q 160 48 460 12 L 445 32 Q 185 72 110 138 L 420 58 L 408 80 Q 160 118 88 175 Z"
        fill="#E10600"
      />
      <text
        x="28"
        y="252"
        fontFamily="'Arial Black', Impact, sans-serif"
        fontSize="72"
        fontWeight="900"
        fill="white"
        letterSpacing="3"
      >
        GRIDLOCK
      </text>
    </svg>
  );
}

// ── Waitlist form ─────────────────────────────────────────────────────────────
function WaitlistForm({ id }: { id?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading" || status === "success") return;
    setStatus("loading");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage("You're on the grid. We'll be in touch before lights out.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Connection failed. Try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} id={id} className="gl-form">
      <div className="gl-form-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="gl-input"
          required
          disabled={status === "loading" || status === "success"}
          autoComplete="email"
        />
        <button
          type="submit"
          className="gl-btn-primary"
          disabled={status === "loading" || status === "success"}
        >
          {status === "loading" ? (
            <span className="gl-btn-loading">
              <span className="gl-spinner" /> JOINING
            </span>
          ) : status === "success" ? (
            "ON THE GRID ✓"
          ) : (
            "JOIN THE GRID"
          )}
        </button>
      </div>
      {message && (
        <p className={`gl-form-msg ${status === "success" ? "gl-form-msg--success" : "gl-form-msg--error"}`}>
          {message}
        </p>
      )}
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WaitlistPage() {
  return (
    <div className="gl-root">

      {/* ── Nav ── */}
      <nav className="gl-nav">
        <div className="gl-nav-inner">
          <GridlockLogo className="gl-nav-logo" />
          <a href="#join" className="gl-nav-cta">
            Join the Grid
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="gl-hero">
        {/* Atmospheric grid lines */}
        <div className="gl-grid-lines" aria-hidden="true">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="gl-grid-line" />
          ))}
        </div>

        {/* Red speed glow */}
        <div className="gl-hero-glow" aria-hidden="true" />

        <div className="gl-hero-inner">
          {/* Left: copy + form */}
          <div className="gl-hero-copy">
            <div className="gl-eyebrow">
              <span className="gl-eyebrow-dot" />
              2026 SEASON · COMING SOON
            </div>

            <h1 className="gl-h1">
              <span className="gl-h1-line">PREDICT.</span>
              <span className="gl-h1-line gl-h1-line--red">COMPETE.</span>
              <span className="gl-h1-line">DOMINATE.</span>
            </h1>

            <p className="gl-hero-sub">
              The F1 prediction game that puts you in the strategist&apos;s seat.
              Race by race. Rival by rival. Every podium counts.
            </p>

            <WaitlistForm id="join" />

            <p className="gl-form-note">
              No spam. No noise. Just race day.
            </p>
          </div>

          {/* Right: helmet */}
          <div className="gl-hero-visual">
            <div className="gl-helmet-stage">
              <div className="gl-helmet-glow-ring" aria-hidden="true" />
              <Image
                src="/gridlock-helmet.png"
                alt="Gridlock racing helmet"
                width={680}
                height={680}
                className="gl-helmet-img"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Ticker ── */}
      <div className="gl-ticker" aria-hidden="true">
        <div className="gl-ticker-track">
          {[...Array(3)].map((_, i) => (
            <span key={i} className="gl-ticker-item">
              BAHRAIN · SAUDI ARABIA · AUSTRALIA · JAPAN · CHINA · MIAMI · EMILIA-ROMAGNA · MONACO · CANADA · SPAIN · AUSTRIA · BRITAIN · HUNGARY · BELGIUM · NETHERLANDS · ITALY · AZERBAIJAN · SINGAPORE · UNITED STATES · MEXICO · BRAZIL · LAS VEGAS · QATAR · ABU DHABI &nbsp;&nbsp;&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section className="gl-features">
        <div className="gl-features-inner">
          <div className="gl-section-label">HOW IT WORKS</div>
          <h2 className="gl-h2">Three steps to the podium.</h2>

          <div className="gl-cards">
            <article className="gl-card">
              <div className="gl-card-num">01</div>
              <div className="gl-card-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect x="2" y="6" width="24" height="16" rx="2" stroke="#E10600" strokeWidth="1.5"/>
                  <path d="M8 14h12M8 10h6M8 18h8" stroke="#E10600" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="gl-card-title">Set Your Grid</h3>
              <p className="gl-card-desc">
                Predict the top-3 before each race weekend. Predictions lock the moment the lights go out.
              </p>
            </article>

            <article className="gl-card">
              <div className="gl-card-num">02</div>
              <div className="gl-card-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="11" stroke="#E10600" strokeWidth="1.5"/>
                  <path d="M14 8v6l4 2" stroke="#E10600" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 className="gl-card-title">Score Points</h3>
              <p className="gl-card-desc">
                3 pts for an exact position. 1 pt for the right driver in the top 3. Precision separates the champions.
              </p>
            </article>

            <article className="gl-card">
              <div className="gl-card-num">03</div>
              <div className="gl-card-icon">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <path d="M6 22L10 14l4 4 4-8 4 10" stroke="#E10600" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="14" cy="6" r="3" stroke="#E10600" strokeWidth="1.5"/>
                </svg>
              </div>
              <h3 className="gl-card-title">Lead the Season</h3>
              <p className="gl-card-desc">
                Live championship standings across all 24 races. Every round reshuffles the board.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="gl-stats">
        <div className="gl-stats-inner">
          <div className="gl-stat">
            <span className="gl-stat-num">24</span>
            <span className="gl-stat-label">RACES</span>
          </div>
          <div className="gl-stat-divider" aria-hidden="true" />
          <div className="gl-stat">
            <span className="gl-stat-num">20</span>
            <span className="gl-stat-label">DRIVERS</span>
          </div>
          <div className="gl-stat-divider" aria-hidden="true" />
          <div className="gl-stat">
            <span className="gl-stat-num">10</span>
            <span className="gl-stat-label">CONSTRUCTORS</span>
          </div>
          <div className="gl-stat-divider" aria-hidden="true" />
          <div className="gl-stat">
            <span className="gl-stat-num">∞</span>
            <span className="gl-stat-label">RIVALRIES</span>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="gl-cta-section">
        <div className="gl-cta-inner">
          <div className="gl-cta-flag" aria-hidden="true">
            {[...Array(64)].map((_, i) => (
              <div key={i} className={`gl-flag-cell ${(Math.floor(i / 8) + (i % 8)) % 2 === 0 ? "gl-flag-cell--dark" : ""}`} />
            ))}
          </div>
          <h2 className="gl-h2 gl-h2--center">
            The season starts soon.<br />
            <span className="gl-text-red">Will you be ready?</span>
          </h2>
          <p className="gl-cta-sub">
            Join thousands of fans already on the grid. Be first when the gates open.
          </p>
          <WaitlistForm />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="gl-footer">
        <div className="gl-footer-inner">
          <GridlockLogo className="gl-footer-logo" />
          <div className="gl-footer-links">
            <a href="/login" className="gl-footer-link">Login</a>
            <a href="/signup" className="gl-footer-link">Sign Up</a>
          </div>
          <p className="gl-footer-copy">© 2026 Gridlock. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
