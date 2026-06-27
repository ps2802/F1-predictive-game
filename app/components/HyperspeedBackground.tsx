"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./HyperspeedBackground.module.css";

/**
 * HyperspeedBackground — a tasteful, dependency-free F1 "warp speed" backdrop
 * for the landing page. It renders forward-motion light streaks racing toward a
 * vanishing point, in the brand palette (red #E10600 accents on black, a faint
 * teal wash). The spirit of the ReactBits Hyperspeed effect without three.js,
 * so the route bundle stays lean.
 *
 * Decorative only:
 *   - aria-hidden + pointer-events:none — never interactive, never announced.
 *   - Positioned behind the hero (z-index:0 inside the login panel).
 *   - Must not block LCP: lazy-mounted by the caller via next/dynamic(ssr:false).
 *
 * Performance + accessibility guards:
 *   - prefers-reduced-motion (or no 2D canvas, or a low-power heuristic) → a
 *     STATIC CSS gradient + faint SVG speed-line fallback, no rAF at all.
 *   - devicePixelRatio capped, frame rate throttled to ~45fps, particle count
 *     scaled to viewport and capped.
 *   - rAF loop pauses on document.hidden (visibilitychange) and is fully torn
 *     down on unmount.
 */

// ── Tunables ───────────────────────────────────────────────────────────────
const TARGET_FPS = 45;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;
const MAX_DPR = 1.5;
const MAX_STREAKS = 140;
const MIN_STREAKS = 36;
// Streaks per 1000 device-independent px of viewport width.
const STREAKS_PER_KPX = 70;
// Fraction of streaks tinted with the teal accent (the rest are F1 red/white).
const TEAL_FRACTION = 0.16;

type StreakColor = "red" | "teal" | "white";

interface Streak {
  // Angle from the vanishing point (radians) and current radius outward.
  angle: number;
  radius: number;
  // Forward speed multiplier — outer streaks accelerate (perspective).
  speed: number;
  // Trail length as a fraction of radius.
  trail: number;
  width: number;
  color: StreakColor;
}

function pickColor(): StreakColor {
  const roll = Math.random();
  if (roll < TEAL_FRACTION) {
    return "teal";
  }
  // Most streaks are F1 red; a minority are near-white hot cores for contrast.
  return roll < TEAL_FRACTION + 0.18 ? "white" : "red";
}

function strokeFor(color: StreakColor, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  if (color === "teal") {
    return `rgba(0, 210, 170, ${a})`;
  }
  if (color === "white") {
    return `rgba(255, 245, 240, ${a})`;
  }
  return `rgba(225, 6, 0, ${a})`;
}

function makeStreak(seedRadius: number): Streak {
  return {
    angle: Math.random() * Math.PI * 2,
    radius: seedRadius,
    speed: 0.6 + Math.random() * 1.7,
    trail: 0.08 + Math.random() * 0.14,
    width: 0.6 + Math.random() * 1.6,
    color: pickColor(),
  };
}

function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  // Coarse heuristic: very low logical-core counts read as low-power hardware.
  const cores = navigator.hardwareConcurrency;
  return typeof cores === "number" && cores > 0 && cores <= 2;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Decide whether to run the animated canvas path. Browser-only, so this is
 * computed lazily in render — safe because the component is mounted client-only
 * (next/dynamic ssr:false), avoiding any hydration mismatch.
 */
function canAnimate(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  if (prefersReducedMotion() || isLowPowerDevice()) {
    return false;
  }
  // Probe for a usable 2D canvas without mounting one in the tree.
  const probe = document.createElement("canvas");
  return Boolean(probe.getContext && probe.getContext("2d"));
}

/**
 * Static, animation-free fallback. Rendered whenever motion is undesirable or
 * the canvas path is unavailable, so the surface is always painted (no empty
 * black box) without spinning up a rAF loop.
 */
function StaticFallback(): React.JSX.Element {
  // Faint speed lines converging on a vanishing point at ~62%/46% — matching
  // the canvas vanishing point and the panel's visual centre of gravity.
  const vx = 62;
  const vy = 46;
  const lines = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const len = 34 + (i % 3) * 14;
    const x2 = vx + Math.cos(angle) * len;
    const y2 = vy + Math.sin(angle) * len;
    const teal = i % 6 === 0;
    return { x2, y2, teal, key: i };
  });

  return (
    <svg
      className={styles.fallback}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="hsp-core" cx="62%" cy="46%" r="60%">
          <stop offset="0%" stopColor="rgba(225,6,0,0.22)" />
          <stop offset="30%" stopColor="rgba(225,6,0,0.07)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#hsp-core)" />
      {lines.map((l) => (
        <line
          key={l.key}
          x1={vx}
          y1={vy}
          x2={l.x2}
          y2={l.y2}
          stroke={l.teal ? "rgba(0,210,170,0.16)" : "rgba(225,6,0,0.14)"}
          strokeWidth={0.35}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

export default function HyperspeedBackground(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Decided once, synchronously, in render — no setState in the effect.
  const [animate] = useState<boolean>(() => canAnimate());

  useEffect(() => {
    if (!animate) {
      return;
    }

    const canvasEl = canvasRef.current;
    if (!canvasEl) {
      return;
    }

    const context = canvasEl.getContext("2d", { alpha: true });
    if (!context) {
      return;
    }

    // Non-null locals so the inner closures keep the narrowed types.
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let widthCss = 0;
    let heightCss = 0;
    let centreX = 0;
    let centreY = 0;
    let maxRadius = 0;
    let streaks: Streak[] = [];

    function resize(): void {
      const parent = canvas.parentElement;
      widthCss = parent?.clientWidth ?? window.innerWidth;
      heightCss = parent?.clientHeight ?? window.innerHeight;
      canvas.width = Math.max(1, Math.round(widthCss * dpr));
      canvas.height = Math.max(1, Math.round(heightCss * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Vanishing point biased right-of-centre, toward the upper third.
      centreX = widthCss * 0.62;
      centreY = heightCss * 0.46;
      maxRadius = Math.hypot(
        Math.max(centreX, widthCss - centreX),
        Math.max(centreY, heightCss - centreY),
      );

      const count = Math.round(
        Math.min(
          MAX_STREAKS,
          Math.max(MIN_STREAKS, (widthCss / 1000) * STREAKS_PER_KPX),
        ),
      );
      streaks = Array.from({ length: count }, () =>
        // Seed across the full radius so the field is populated on first frame.
        makeStreak(Math.random() * maxRadius),
      );
    }

    function reset(streak: Streak): void {
      streak.angle = Math.random() * Math.PI * 2;
      streak.radius = Math.random() * (maxRadius * 0.12);
      streak.speed = 0.6 + Math.random() * 1.7;
      streak.trail = 0.08 + Math.random() * 0.14;
      streak.width = 0.6 + Math.random() * 1.6;
      streak.color = pickColor();
    }

    function drawFrame(): void {
      // Trail fade: paint a low-alpha black wash instead of clearing, leaving
      // motion streaks. Keeps the panel reading as near-black.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
      ctx.fillRect(0, 0, widthCss, heightCss);

      ctx.globalCompositeOperation = "lighter";
      for (const s of streaks) {
        // Perspective: streaks accelerate as they move outward.
        const accel = 1 + (s.radius / maxRadius) * 2.4;
        s.radius += s.speed * accel;

        const cos = Math.cos(s.angle);
        const sin = Math.sin(s.angle);
        const x = centreX + cos * s.radius;
        const y = centreY + sin * s.radius;
        const innerR = s.radius * (1 - s.trail);
        const x0 = centreX + cos * innerR;
        const y0 = centreY + sin * innerR;

        // Fade in near the core, fade out near the edge.
        const depth = s.radius / maxRadius;
        const alpha = Math.min(1, depth * 1.8) * (1 - depth * 0.65) * 0.85;

        ctx.strokeStyle = strokeFor(s.color, alpha);
        ctx.lineWidth = s.width * (0.5 + depth * 1.5);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x, y);
        ctx.stroke();

        if (s.radius >= maxRadius) {
          reset(s);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }

    let rafId = 0;
    let lastTime = 0;
    let running = true;

    function loop(now: number): void {
      if (!running) {
        return;
      }
      rafId = window.requestAnimationFrame(loop);
      if (now - lastTime < FRAME_INTERVAL_MS) {
        return;
      }
      lastTime = now;
      drawFrame();
    }

    function start(): void {
      if (rafId !== 0) {
        return;
      }
      lastTime = 0;
      rafId = window.requestAnimationFrame(loop);
    }

    function stop(): void {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function onVisibility(): void {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    }

    resize();
    running = true;
    if (!document.hidden) {
      start();
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => resize())
        : null;
    if (resizeObserver && canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener("resize", resize);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", resize);
      }
    };
  }, [animate]);

  return (
    <div className={styles.root} aria-hidden="true">
      {animate ? (
        <canvas ref={canvasRef} className={styles.canvas} />
      ) : (
        <StaticFallback />
      )}
    </div>
  );
}
