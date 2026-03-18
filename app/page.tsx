"use client";

import { useState } from "react";

function WaitlistForm() {
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
        setMessage("You're on the grid.");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong.");
      }
    } catch {
      setStatus("error");
      setMessage("Connection failed. Try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="gl-form">
      {status === "success" ? (
        <div className="gl-success">
          <span className="gl-success-dot" />
          You&apos;re on the grid. We&apos;ll be in touch.
        </div>
      ) : (
        <div className="gl-form-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="gl-input"
            required
            disabled={status === "loading"}
            autoComplete="email"
          />
          <button type="submit" className="gl-btn" disabled={status === "loading"}>
            {status === "loading" ? <span className="gl-spinner" /> : "JOIN THE GRID"}
          </button>
        </div>
      )}
      {status === "error" && <p className="gl-error">{message}</p>}
    </form>
  );
}

export default function WaitlistPage() {
  return (
    <div className="gl-root">

      {/* ── Red speed stripe ── */}
      <div className="gl-stripe" aria-hidden="true" />

      {/* ── Left panel ── */}
      <div className="gl-left">

        {/* Logo */}
        <header className="gl-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Gridlock logo.png" alt="Gridlock" className="gl-logo" draggable={false} />
        </header>

        {/* Copy */}
        <main className="gl-copy">
          <div className="gl-eyebrow">
            <span className="gl-dot" />
            2026 SEASON · COMING SOON
          </div>

          <h1 className="gl-h1">
            The F1<br />
            prediction<br />
            <em>game.</em>
          </h1>

          <p className="gl-sub">
            Predict the grid. Outsmart the crowd.<br />
            Skill over consensus — always.
          </p>

          <WaitlistForm />

          <p className="gl-note">No spam. Just race day.</p>
        </main>

        {/* Footer */}
        <footer className="gl-footer">
          © 2026 Gridlock
        </footer>
      </div>

      {/* ── Right panel — helmet ── */}
      <div className="gl-right" aria-hidden="true">
        <div className="gl-glow" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock-helmet.png"
          alt=""
          className="gl-helmet"
          draggable={false}
        />
      </div>

    </div>
  );
}
