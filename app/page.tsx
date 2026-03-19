"use client";

import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   SOCIAL ICONS — inline SVG, no external deps
────────────────────────────────────────────── */
function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.631 5.905-5.631zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconThreads() {
  return (
    <svg width="14" height="14" viewBox="0 0 192 192" fill="currentColor" aria-hidden="true">
      <path d="M141.537 88.988a66.667 66.667 0 0 0-2.518-1.143c-1.482-27.307-16.403-42.94-41.457-43.1h-.34c-14.986 0-27.449 6.396-35.12 18.036l13.779 9.452c5.73-8.695 14.724-10.548 21.348-10.548h.229c8.249.053 14.474 2.452 18.503 7.129 2.932 3.405 4.893 8.111 5.864 14.05-7.314-1.243-15.224-1.626-23.68-1.14-23.82 1.371-39.134 15.264-38.105 34.568.522 9.792 5.4 18.216 13.735 23.719 7.047 4.652 16.124 6.927 25.557 6.412 12.458-.683 22.231-5.436 29.049-14.127 5.178-6.6 8.453-15.153 9.899-25.93 5.937 3.583 10.337 8.298 12.767 13.966 4.132 9.635 4.373 25.468-8.546 38.376-11.319 11.308-24.925 16.2-45.488 16.351-22.763-.169-40.019-7.483-51.274-21.741C35.236 139.966 29.808 120.682 29.605 96c.203-24.682 5.63-43.966 16.133-57.317C57.001 24.425 74.257 17.11 97.02 16.94c22.924.17 40.491 7.52 52.208 21.847 5.763 7.09 10.12 16.16 13.027 26.57l16.271-4.34c-3.522-12.904-9.052-24.075-16.585-33.193C147.933 9.564 126.397.204 97.07 0h-.113C67.77.205 46.455 9.6 32.156 27.944 19.343 44.514 12.703 67.638 12.5 96v.027c.203 28.39 6.842 51.5 19.656 68.07 14.3 18.358 35.614 27.75 63.384 27.953h.114c24.878-.169 42.473-6.686 57.048-21.244 18.963-18.945 18.392-42.692 12.146-57.27-4.484-10.453-13.033-18.944-23.311-24.548zm-40.703 28.547c-10.44.571-21.297-4.101-21.86-14.15-.421-7.892 5.618-16.695 23.79-17.733 2.08-.12 4.127-.177 6.147-.177 6.081 0 11.784.571 16.99 1.679-1.934 24.167-13.954 29.823-25.067 30.381z" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   SOCIAL FEED
   Static data — structured for easy API replacement.
   Infinite horizontal marquee, pauses on hover.
────────────────────────────────────────────── */
const FEED_ITEMS: { text: string; time: string }[] = [
  { text: "Season 2026. 24 rounds. Every prediction counts. Are you ready?", time: "2h" },
  { text: "Who takes pole in Bahrain? Lock in your call before the lights go out.", time: "1d" },
  { text: "Gridlock is the prediction game built for people who actually watch qualifying.", time: "3d" },
  { text: "We track what teams don't publish. Pace delta, sector splits, tyre deg — all of it.", time: "5d" },
  { text: "Skill over consensus. Always. Join the waitlist and be first on the grid.", time: "1w" },
];

function SocialFeed() {
  const items = [...FEED_ITEMS, ...FEED_ITEMS]; // doubled for seamless loop
  return (
    <div className="gl-feed" aria-label="Latest from @GridlockLeague">
      <div className="gl-feed-label">
        <span className="gl-feed-dot" aria-hidden="true" />
        <span>@GridlockLeague</span>
      </div>
      <div className="gl-feed-track">
        <div className="gl-feed-inner">
          {items.map((item, i) => (
            <div key={i} className="gl-feed-card">
              <p className="gl-feed-text">{item.text}</p>
              <span className="gl-feed-time">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   F1 PRECISION CURSOR
   At rest : thin white ring — nearly invisible.
   On hover (.gl-cursor-target):
     Ring morphs into a horizontal F1 car body
     (wide oval, red border) with rear wing above
     (wider) and front wing below (narrower).
   Lagged follow via rAF lerp at 12 %/frame.
────────────────────────────────────────────── */
function F1Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
────────────────────────────────────────────── */
function TrackBackground() {
  return (
    <svg
      className="gl-track-bg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <filter id="f-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
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
        d="M 160 148 C 400 55 882 55 1142 202 C 1312 302 1382 462 1296 602 C 1216 726 1042 787 842 783 C 718 781 638 751 558 783 C 480 813 398 843 278 823 C 174 804 76 738 76 618 C 76 474 76 296 160 148 Z"
        stroke="rgba(255,255,255,0.055)"
        strokeWidth="1.5"
        fill="none"
      />

      {/* ── Inner track limit ────────────────────────── */}
      <path
        d="M 226 210 C 424 132 858 130 1082 254 C 1238 338 1298 470 1224 594 C 1149 708 986 759 804 755 C 696 752 624 724 552 754 C 486 780 414 807 308 789 C 218 773 138 716 138 604 C 138 471 138 301 226 210 Z"
        stroke="rgba(255,255,255,0.03)"
        strokeWidth="1"
        fill="none"
      />

      {/* ── Sector markers ───────────────────────────── */}
      <line x1="1142" y1="202" x2="1082" y2="254" stroke="rgba(225,6,0,0.22)" strokeWidth="1.5" filter="url(#f-ambient)" />
      <line x1="1296" y1="602" x2="1224" y2="594" stroke="rgba(225,6,0,0.22)" strokeWidth="1.5" filter="url(#f-ambient)" />
      <line x1="278"  y1="823" x2="308"  y2="789" stroke="rgba(225,6,0,0.22)" strokeWidth="1.5" filter="url(#f-ambient)" />

      {/* ── DRS zone ─────────────────────────────────── */}
      {[0, 14, 28].map((d, i) => (
        <line key={i} x1={76 + d} y1="340" x2={138 + d} y2="340" stroke="rgba(0,210,170,0.1)" strokeWidth="0.8" />
      ))}
      <line x1="76" y1="340" x2="138" y2="340" stroke="rgba(0,210,170,0.18)" strokeWidth="1" filter="url(#f-glow)" />

      {/* ── Corner apex markers ───────────────────────── */}
      <circle cx="1220" cy="420" r="5" stroke="rgba(255,255,255,0.1)"  strokeWidth="1"   fill="none" filter="url(#f-glow)" />
      <circle cx="107"  cy="618" r="5" stroke="rgba(255,255,255,0.09)" strokeWidth="1"   fill="none" />
      <circle cx="278"  cy="833" r="4" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" fill="none" />
      <circle cx="160"  cy="148" r="4" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" fill="none" />

      {/* ── Grid reference nodes ─────────────────────── */}
      {[[160,148],[1142,202],[1296,602],[842,783],[278,823],[76,618],[1220,420],[558,783]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="rgba(255,255,255,0.07)" />
      ))}

      {/* ── Telemetry trace ───────────────────────────── */}
      <path
        d="M 76 500 C 200 490 350 470 500 450 C 650 430 750 400 900 385 C 1000 375 1100 390 1200 430 C 1300 465 1380 490 1440 495"
        stroke="rgba(0,200,165,0.08)"
        strokeWidth="1"
        fill="none"
        strokeDasharray="5 10"
      />

      {/* ── Pit lane line ────────────────────────────── */}
      <path d="M 110 470 C 115 430 118 400 116 360" stroke="rgba(255,255,255,0.035)" strokeWidth="1" fill="none" strokeDasharray="3 6" />

      {/* ── Start/finish grid hatching ────────────────── */}
      {[0,1,2,3].map((n) => (
        <line key={n} x1={76} y1={540+n*18} x2={138} y2={540+n*18} stroke="rgba(255,255,255,0.035)" strokeWidth="0.6" />
      ))}

      {/* ── Hairpin highlight ─────────────────────────── */}
      <path d="M 1296 602 C 1340 680 1300 760 1200 783" stroke="rgba(255,255,255,0.06)" strokeWidth="2" fill="none" filter="url(#f-glow)" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   HELMET PANEL
   Right panel with:
   - Starting grid lines (CSS, background)
   - Ghost position number "01" behind helmet
   - Dual ambient glow layers (reduced fog)
   - Idle float + visor shimmer (CSS)
   - Mouse-reactive perspective tilt (JS, desktop)
   - F1 HUD overlay: sector times, lap, corner tag
   - Hover: monochrome telemetry mode + scan sweep
────────────────────────────────────────────── */
function HelmetPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const panel = panelRef.current;
    const wrap  = wrapRef.current;
    if (!panel || !wrap) return;

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;

    const onMove = (e: MouseEvent) => {
      const r  = panel.getBoundingClientRect();
      const nx = (e.clientX - r.left)  / r.width  - 0.5;
      const ny = (e.clientY - r.top)   / r.height - 0.5;
      tx =  nx * 8;
      ty = -ny * 5;
    };

    const onLeave = () => { tx = 0; ty = 0; };

    const tick = () => {
      cx += (tx - cx) * 0.055;
      cy += (ty - cy) * 0.055;
      wrap.style.transform =
        `perspective(900px) rotateY(${cx}deg) rotateX(${cy}deg)`;
      raf = requestAnimationFrame(tick);
    };

    panel.addEventListener("mousemove", onMove, { passive: true });
    panel.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      panel.removeEventListener("mousemove", onMove);
      panel.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="gl-right" ref={panelRef} aria-hidden="true">

      {/* Starting grid lines — low-opacity horizontal stripes, bottom third */}
      <div className="gl-grid-lines" />

      {/* ── Circuit track + lapping F1 car ── */}
      <div className="gl-circuit" aria-hidden="true">
        <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="gl-circuit-svg">
          <defs>
            <filter id="track-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="car-halo" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="car-bloom" x="-400%" y="-400%" width="900%" height="900%">
              <feGaussianBlur stdDeviation="12"/>
            </filter>
          </defs>

          {/*
            Smooth closed oval hugging the helmet silhouette at a
            consistent ~25 px gap. Four G1-continuous cubic bezier
            segments, one per quadrant. No kinks, no fake features.
            Clockwise from top-centre (S/F tick at top).
          */}

          {/* Track surface band */}
          <path
            d="M 250,38 C 365,34 448,108 455,228 C 462,350 395,468 250,480 C 105,468 38,350 45,228 C 52,108 135,34 250,38 Z"
            stroke="rgba(225,6,0,0.07)" strokeWidth="10"
          />

          {/* Glow bed */}
          <path
            d="M 250,38 C 365,34 448,108 455,228 C 462,350 395,468 250,480 C 105,468 38,350 45,228 C 52,108 135,34 250,38 Z"
            stroke="rgba(225,6,0,0.18)" strokeWidth="16"
            filter="url(#track-glow)"
          />

          {/* Centerline — precision hairline */}
          <path
            id="gl-track-path"
            d="M 250,38 C 365,34 448,108 455,228 C 462,350 395,468 250,480 C 105,468 38,350 45,228 C 52,108 135,34 250,38 Z"
            stroke="rgba(225,6,0,0.72)" strokeWidth="1.5"
          />

          {/* Start/Finish tick — top centre, perpendicular to track */}
          <line x1="243" y1="32" x2="257" y2="32"
            stroke="rgba(255,255,255,0.55)" strokeWidth="1.5"/>

          {/* Car wide bloom */}
          <circle r="10" fill="rgba(225,6,0,0.2)" filter="url(#car-bloom)">
            <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
              <mpath href="#gl-track-path"/>
            </animateMotion>
          </circle>

          {/* Car halo */}
          <circle r="5" fill="rgba(220,30,0,0.55)" filter="url(#car-halo)">
            <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
              <mpath href="#gl-track-path"/>
            </animateMotion>
          </circle>

          {/* Car core */}
          <circle r="2.5" fill="rgba(255,255,255,0.95)">
            <animateMotion dur="5.5s" repeatCount="indefinite" rotate="auto">
              <mpath href="#gl-track-path"/>
            </animateMotion>
          </circle>

          {/* Wake — fading comet tail */}
          <circle r="2" fill="rgba(255,70,0,0.4)">
            <animateMotion dur="5.5s" begin="-0.13s" repeatCount="indefinite" rotate="auto">
              <mpath href="#gl-track-path"/>
            </animateMotion>
          </circle>
          <circle r="1.5" fill="rgba(225,6,0,0.22)">
            <animateMotion dur="5.5s" begin="-0.26s" repeatCount="indefinite" rotate="auto">
              <mpath href="#gl-track-path"/>
            </animateMotion>
          </circle>
          <circle r="1" fill="rgba(225,6,0,0.1)">
            <animateMotion dur="5.5s" begin="-0.42s" repeatCount="indefinite" rotate="auto">
              <mpath href="#gl-track-path"/>
            </animateMotion>
          </circle>
        </svg>
      </div>

      {/* Ghost grid position — barely-there red numeral behind helmet */}
      <div className="gl-hud-pos">01</div>

      {/* Helmet with parallax tilt */}
      <div className="gl-helmet-wrap" ref={wrapRef}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock-helmet.png"
          alt=""
          className="gl-helmet"
          draggable={false}
        />
        <div className="gl-shimmer" aria-hidden="true" />
      </div>

      {/* ── F1 HUD overlay ──────────────────────────── */}

      {/* Corner tag — top-right */}
      <div className="gl-hud-corner">T12 ›</div>

      {/* Sector timing strip — bottom bar */}
      <div className="gl-hud-strip">
        <div className="gl-hud-sector">
          <span className="gl-hud-s-label">S1</span>
          <span className="gl-hud-s-val">28.4</span>
        </div>
        <div className="gl-hud-divider" />
        <div className="gl-hud-sector">
          <span className="gl-hud-s-label">S2</span>
          <span className="gl-hud-s-val">31.1</span>
        </div>
        <div className="gl-hud-divider" />
        <div className="gl-hud-sector">
          <span className="gl-hud-s-label">S3</span>
          <span className="gl-hud-s-val">22.8</span>
        </div>
        <div className="gl-hud-divider" />
        <div className="gl-hud-sector">
          <span className="gl-hud-s-label">LAP</span>
          <span className="gl-hud-s-val">01/57</span>
        </div>
      </div>

    </div>
  );
}

/* ─────────────────────────────────────────────
   WAITLIST FORM
   Unchanged — still POSTs to /api/waitlist
────────────────────────────────────────────── */
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
────────────────────────────────────────────── */
export default function WaitlistPage() {
  return (
    <div className="gl-root">

      {/* Circuit track background */}
      <TrackBackground />

      {/* Red speed stripe */}
      <div className="gl-stripe" aria-hidden="true" />

      {/* ── Left panel ── */}
      <div className="gl-left">

        {/* Header: logo left · social icons right */}
        <header className="gl-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/gridlock logo - transparent.png"
            alt="Gridlock"
            className="gl-logo gl-cursor-target"
            draggable={false}
          />
          <nav className="gl-social-bar" aria-label="Follow Gridlock">
            <a
              href="https://x.com/Gridlockleague"
              className="gl-social-link gl-cursor-target"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow on X"
            >
              <IconX />
            </a>
            <a
              href="https://www.instagram.com/gridlockleague/"
              className="gl-social-link gl-cursor-target"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow on Instagram"
            >
              <IconInstagram />
            </a>
            <a
              href="https://www.threads.com/@gridlockleague"
              className="gl-social-link gl-cursor-target"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Follow on Threads"
            >
              <IconThreads />
            </a>
          </nav>
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

          {/* Telemetry data bar — F1 identity anchor */}
          <div className="gl-telem-bar" aria-hidden="true">
            <span>20 DRIVERS</span>
            <span className="gl-telem-sep" />
            <span>24 ROUNDS</span>
            <span className="gl-telem-sep" />
            <span>SEASON 2026</span>
          </div>

          <WaitlistForm />

          <p className="gl-note">No spam. Just race day.</p>
        </main>

        {/* Social proof feed — compact marquee */}
        <SocialFeed />

        {/* Footer */}
        <footer className="gl-footer">
          © 2026 Gridlock
        </footer>
      </div>

      {/* ── Right panel — helmet + F1 HUD ── */}
      <HelmetPanel />

    </div>
  );
}
