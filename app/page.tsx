"use client";

import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   F1 PRECISION CURSOR
   Lagged ring that locks + turns red on hover
   over interactive elements (.gl-cursor-target)
───────────────────────────────────────────── */
function F1Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Touch devices: skip entirely
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const el = ref.current;
    if (!el) return;

    let mx = 0, my = 0, cx = 0, cy = 0, raf = 0;

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      el.style.opacity = "1";
    };

    const onOver = (e: MouseEvent) => {
      el.classList.toggle(
        "is-locked",
        !!(e.target as Element).closest(".gl-cursor-target")
      );
    };

    const tick = () => {
      cx += (mx - cx) * 0.12;
      cy += (my - cy) * 0.12;
      el.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} className="gl-cursor" aria-hidden="true" />;
}

/* ─────────────────────────────────────────────
   CIRCUIT TRACK BACKGROUND
   Abstract F1 circuit linework — sector markers,
   corner apexes, DRS zone, telemetry trace.
   All at very low opacity, pointer-events: none.
───────────────────────────────────────────── */
function TrackBackground() {
  return (
    <svg
      className="gl-track-bg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        {/* Soft glow for highlighted circuit elements */}
        <filter id="f-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Wide ambient glow for sector markers */}
        <filter id="f-ambient" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Outer circuit ribbon ─────────────────────── */}
      <path
        d="
          M 160 148
          C 400 55 882 55 1142 202
          C 1312 302 1382 462 1296 602
          C 1216 726 1042 787 842 783
          C 718 781 638 751 558 783
          C 480 813 398 843 278 823
          C 174 804 76 738 76 618
          C 76 474 76 296 160 148 Z
        "
        stroke="rgba(255,255,255,0.055)"
        strokeWidth="1.5"
        fill="none"
      />

      {/* ── Inner track limit ────────────────────────── */}
      <path
        d="
          M 226 210
          C 424 132 858 130 1082 254
          C 1238 338 1298 470 1224 594
          C 1149 708 986 759 804 755
          C 696 752 624 724 552 754
          C 486 780 414 807 308 789
          C 218 773 138 716 138 604
          C 138 471 138 301 226 210 Z
        "
        stroke="rgba(255,255,255,0.03)"
        strokeWidth="1"
        fill="none"
      />

      {/* ── Sector 1 marker — top-right of circuit ───── */}
      <line
        x1="1142" y1="202" x2="1082" y2="254"
        stroke="rgba(225,6,0,0.22)"
        strokeWidth="1.5"
        filter="url(#f-ambient)"
      />

      {/* ── Sector 2 marker — lower-right ────────────── */}
      <line
        x1="1296" y1="602" x2="1224" y2="594"
        stroke="rgba(225,6,0,0.22)"
        strokeWidth="1.5"
        filter="url(#f-ambient)"
      />

      {/* ── Sector 3 marker — lower-left ─────────────── */}
      <line
        x1="278" y1="823" x2="308" y2="789"
        stroke="rgba(225,6,0,0.22)"
        strokeWidth="1.5"
        filter="url(#f-ambient)"
      />

      {/* ── DRS zone — main straight (left side) ─────── */}
      {[0, 14, 28].map((d, i) => (
        <line
          key={i}
          x1={76 + d} y1="340"
          x2={138 + d} y2="340"
          stroke="rgba(0,210,170,0.1)"
          strokeWidth="0.8"
        />
      ))}
      <line
        x1="76" y1="340" x2="138" y2="340"
        stroke="rgba(0,210,170,0.18)"
        strokeWidth="1"
        filter="url(#f-glow)"
      />

      {/* ── Corner apex markers ───────────────────────── */}
      {/* Top-right hairpin */}
      <circle cx="1220" cy="420" r="5" stroke="rgba(255,255,255,0.1)" strokeWidth="1" fill="none" filter="url(#f-glow)" />
      {/* Bottom-left hairpin */}
      <circle cx="107" cy="618" r="5" stroke="rgba(255,255,255,0.09)" strokeWidth="1" fill="none" />
      {/* Bottom sweep */}
      <circle cx="278" cy="833" r="4" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" fill="none" />
      {/* Top sweep entry */}
      <circle cx="160" cy="148" r="4" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" fill="none" />

      {/* ── Grid reference nodes — track node positions ─ */}
      {[
        [160, 148], [1142, 202], [1296, 602], [842, 783],
        [278, 823], [76, 618],  [1220, 420], [558, 783],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="rgba(255,255,255,0.07)" />
      ))}

      {/* ── Telemetry trace — speed/throttle line ─────── */}
      <path
        d="
          M 76 500
          C 200 490 350 470 500 450
          C 650 430 750 400 900 385
          C 1000 375 1100 390 1200 430
          C 1300 465 1380 490 1440 495
        "
        stroke="rgba(0,200,165,0.08)"
        strokeWidth="1"
        fill="none"
        strokeDasharray="5 10"
      />

      {/* ── Pit lane line (parallel to main straight) ─── */}
      <path
        d="M 110 470 C 115 430 118 400 116 360"
        stroke="rgba(255,255,255,0.035)"
        strokeWidth="1"
        fill="none"
        strokeDasharray="3 6"
      />

      {/* ── Start/finish straight grid hatching ──────────*/}
      {[0, 1, 2, 3].map((n) => (
        <line
          key={n}
          x1={76} y1={540 + n * 18}
          x2={138} y2={540 + n * 18}
          stroke="rgba(255,255,255,0.035)"
          strokeWidth="0.6"
        />
      ))}

      {/* ── Hairpin highlight ─────────────────────────── */}
      <path
        d="M 1296 602 C 1340 680 1300 760 1200 783"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="2"
        fill="none"
        filter="url(#f-glow)"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   WAITLIST FORM
   Unchanged — still POSTs to /api/waitlist
───────────────────────────────────────────── */
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
            className="gl-input gl-cursor-target"
            required
            disabled={status === "loading"}
            autoComplete="email"
          />
          <button
            type="submit"
            className="gl-btn gl-cursor-target"
            disabled={status === "loading"}
          >
            {status === "loading" ? <span className="gl-spinner" /> : "JOIN THE GRID"}
          </button>
        </div>
      )}
      {status === "error" && <p className="gl-error">{message}</p>}
    </form>
  );
}

/* ─────────────────────────────────────────────
   WAITLIST PAGE
───────────────────────────────────────────── */
export default function WaitlistPage() {
  return (
    <div className="gl-root">

      {/* Custom F1 cursor — desktop only */}
      <F1Cursor />

      {/* Circuit track background */}
      <TrackBackground />

      {/* ── Red speed stripe ── */}
      <div className="gl-stripe" aria-hidden="true" />

      {/* ── Left panel ── */}
      <div className="gl-left">

        {/* Logo — uses /gridlock logo - transparent.png */}
        <header className="gl-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gridlock logo - transparent.png"
            alt="Gridlock"
            className="gl-logo gl-cursor-target"
            draggable={false}
          />
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
