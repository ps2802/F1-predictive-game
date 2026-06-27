"use client";

/* ═══════════════════════════════════════════════════════════════════════════ */
/* TrackMap — Canvas circuit map hero for the dashboard.                         */
/*                                                                               */
/* Three modes, chosen server-side via GET /api/openf1/state:                    */
/*   live   → poll /api/openf1/live for real car positions.                      */
/*   replay → fetch /api/openf1/replay once, loop the recorded frames.           */
/*   static → draw a clean circuit silhouette + next-race countdown.             */
/*                                                                               */
/* Never throws on missing data — always degrades to the static silhouette.      */
/* Pauses rAF + polling when offscreen / tab hidden. Honours reduced-motion.     */
/* All OpenF1 traffic is server-side (this component only calls our own routes). */
/* ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/components/TrackMap.module.css";

/* ─────────────────────────────────────────────────────────────────────────── */
/* API contract types (consumed, not owned)                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

type TrackMode = "live" | "replay" | "static";

interface StateSession {
  sessionKey: number;
  sessionName: string;
  sessionType: string;
  circuitShortName: string | null;
  countryName: string | null;
  year: number;
}

interface NextRace {
  name: string;
  round: number | null;
  startsAtIso: string | null;
}

interface StateResponse {
  mode: TrackMode;
  session: StateSession | null;
  nextRace: NextRace | null;
  liveCredentialPresent: boolean;
  reason?: string;
}

interface CircuitGeometry {
  points: [number, number][];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface ReplayDriver {
  driverNumber: number;
  acronym: string;
  teamColour: string; // hex WITHOUT '#'
}

interface ReplayCar {
  n: number;
  x: number;
  y: number;
}

interface ReplayFrame {
  t: number; // ms from window start
  cars: ReplayCar[];
}

interface ReplayResponse {
  sessionKey: number;
  circuit: CircuitGeometry | null;
  drivers: ReplayDriver[];
  frames: ReplayFrame[];
  durationMs: number;
}

interface LiveCar {
  n: number;
  x: number;
  y: number;
  position: number | null;
}

interface LiveResponse {
  cars: LiveCar[];
  updatedAtIso: string;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Tunables                                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

const MAX_DPR = 2;
const CANVAS_PADDING = 22;
const LIVE_POLL_MS = 4000; // car positions cadence (~per spec)
const REPLAY_PLAYBACK_RATE = 1; // 1× wall-clock playback of recorded frames
const TRACK_STROKE = "rgba(255,255,255,0.16)";
const TRACK_STROKE_GLOW = "rgba(255,255,255,0.05)";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Built-in stylized fallback circuit (used when no real geometry is available)  */
/* A smooth closed loop in an arbitrary unit space — fitted to canvas like real   */
/* geometry, so a fully-gated state still shows a clean map, never blank.         */
/* ─────────────────────────────────────────────────────────────────────────── */

const FALLBACK_CIRCUIT: CircuitGeometry = buildFallbackCircuit();

function buildFallbackCircuit(): CircuitGeometry {
  const pts: [number, number][] = [];
  const steps = 120;
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    // A wobbled ellipse with a chicane-ish lobe — reads as a "circuit", not a ring.
    const r = 1 + 0.28 * Math.sin(a * 3) + 0.12 * Math.cos(a * 5);
    const x = Math.cos(a) * r * 1.55;
    const y = Math.sin(a) * r;
    pts.push([x, y]);
  }
  return { points: pts, bounds: boundsOf(pts) };
}

function boundsOf(points: [number, number][]): CircuitGeometry["bounds"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Type guards — narrow `unknown` at the fetch boundary, no `any`.               */
/* ─────────────────────────────────────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseMode(value: unknown): TrackMode {
  return value === "live" || value === "replay" || value === "static"
    ? value
    : "static";
}

function parseStateResponse(raw: unknown): StateResponse {
  const record = asRecord(raw);
  if (record === null) {
    return {
      mode: "static",
      session: null,
      nextRace: null,
      liveCredentialPresent: false,
    };
  }

  const sessionRecord = asRecord(record.session);
  const session: StateSession | null =
    sessionRecord && asNumber(sessionRecord.sessionKey) !== null
      ? {
          sessionKey: asNumber(sessionRecord.sessionKey) ?? 0,
          sessionName: asString(sessionRecord.sessionName) ?? "Session",
          sessionType: asString(sessionRecord.sessionType) ?? "",
          circuitShortName: asString(sessionRecord.circuitShortName),
          countryName: asString(sessionRecord.countryName),
          year: asNumber(sessionRecord.year) ?? new Date().getFullYear(),
        }
      : null;

  const nextRaceRecord = asRecord(record.nextRace);
  const nextRace: NextRace | null = nextRaceRecord
    ? {
        name: asString(nextRaceRecord.name) ?? "Next Race",
        round: asNumber(nextRaceRecord.round),
        startsAtIso: asString(nextRaceRecord.startsAtIso),
      }
    : null;

  return {
    mode: parseMode(record.mode),
    session,
    nextRace,
    liveCredentialPresent: record.liveCredentialPresent === true,
    reason: asString(record.reason) ?? undefined,
  };
}

function parseCircuit(raw: unknown): CircuitGeometry | null {
  const record = asRecord(raw);
  if (record === null || !Array.isArray(record.points)) return null;

  const points: [number, number][] = [];
  for (const entry of record.points) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const x = asNumber(entry[0]);
    const y = asNumber(entry[1]);
    if (x === null || y === null) continue;
    points.push([x, y]);
  }
  if (points.length < 3) return null;

  const boundsRecord = asRecord(record.bounds);
  const bounds =
    boundsRecord &&
    asNumber(boundsRecord.minX) !== null &&
    asNumber(boundsRecord.minY) !== null &&
    asNumber(boundsRecord.maxX) !== null &&
    asNumber(boundsRecord.maxY) !== null
      ? {
          minX: asNumber(boundsRecord.minX) ?? 0,
          minY: asNumber(boundsRecord.minY) ?? 0,
          maxX: asNumber(boundsRecord.maxX) ?? 1,
          maxY: asNumber(boundsRecord.maxY) ?? 1,
        }
      : boundsOf(points);

  return { points, bounds };
}

function parseDrivers(raw: unknown): ReplayDriver[] {
  if (!Array.isArray(raw)) return [];
  const out: ReplayDriver[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const num = record ? asNumber(record.driverNumber) : null;
    if (record === null || num === null) continue;
    out.push({
      driverNumber: num,
      acronym: asString(record.acronym) ?? String(num),
      teamColour: normaliseColour(asString(record.teamColour)),
    });
  }
  return out;
}

function parseFrames(raw: unknown): ReplayFrame[] {
  if (!Array.isArray(raw)) return [];
  const out: ReplayFrame[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const t = record ? asNumber(record.t) : null;
    if (record === null || t === null || !Array.isArray(record.cars)) continue;
    const cars: ReplayCar[] = [];
    for (const carRaw of record.cars) {
      const carRecord = asRecord(carRaw);
      const n = carRecord ? asNumber(carRecord.n) : null;
      const x = carRecord ? asNumber(carRecord.x) : null;
      const y = carRecord ? asNumber(carRecord.y) : null;
      if (n === null || x === null || y === null) continue;
      cars.push({ n, x, y });
    }
    out.push({ t, cars });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function parseReplayResponse(raw: unknown): ReplayResponse {
  const record = asRecord(raw);
  if (record === null) {
    return { sessionKey: 0, circuit: null, drivers: [], frames: [], durationMs: 0 };
  }
  const frames = parseFrames(record.frames);
  const durationMs =
    asNumber(record.durationMs) ?? (frames.length > 0 ? frames[frames.length - 1].t : 0);
  return {
    sessionKey: asNumber(record.sessionKey) ?? 0,
    circuit: parseCircuit(record.circuit),
    drivers: parseDrivers(record.drivers),
    frames,
    durationMs,
  };
}

function parseLiveResponse(raw: unknown): LiveResponse {
  const record = asRecord(raw);
  if (record === null || !Array.isArray(record.cars)) {
    return { cars: [], updatedAtIso: new Date().toISOString() };
  }
  const cars: LiveCar[] = [];
  for (const carRaw of record.cars) {
    const carRecord = asRecord(carRaw);
    const n = carRecord ? asNumber(carRecord.n) : null;
    const x = carRecord ? asNumber(carRecord.x) : null;
    const y = carRecord ? asNumber(carRecord.y) : null;
    if (n === null || x === null || y === null) continue;
    cars.push({
      n,
      x,
      y,
      position: carRecord ? asNumber(carRecord.position) : null,
    });
  }
  return {
    cars,
    updatedAtIso: asString(record.updatedAtIso) ?? new Date().toISOString(),
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Colour helpers                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

function normaliseColour(raw: string | null): string {
  if (raw === null) return "FFFFFF";
  const hex = raw.replace(/^#/, "").trim();
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex : "FFFFFF";
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Geometry — project unit-space circuit/cars into canvas pixels, aspect-fit.    */
/* ─────────────────────────────────────────────────────────────────────────── */

interface Projector {
  toCanvas(x: number, y: number): [number, number];
}

function makeProjector(
  bounds: CircuitGeometry["bounds"],
  width: number,
  height: number,
): Projector {
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
  const usableW = Math.max(1, width - CANVAS_PADDING * 2);
  const usableH = Math.max(1, height - CANVAS_PADDING * 2);
  const scale = Math.min(usableW / spanX, usableH / spanY);

  // Centre the fitted path within the canvas.
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = (width - drawW) / 2;
  const offsetY = (height - drawH) / 2;

  return {
    toCanvas(x: number, y: number): [number, number] {
      const px = offsetX + (x - bounds.minX) * scale;
      // OpenF1 location Y grows "up"; canvas Y grows down — flip so the map
      // reads the right way round.
      const py = offsetY + (bounds.maxY - y) * scale;
      return [px, py];
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Countdown formatting                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */

function formatCountdown(targetIso: string | null, nowMs: number): string {
  if (targetIso === null) return "—:—:—";
  const target = Date.parse(targetIso);
  if (Number.isNaN(target)) return "—:—:—";
  const diff = target - nowMs;
  if (diff <= 0) return "LIGHTS OUT";

  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (value: number): string => String(value).padStart(2, "0");

  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Reduced-motion hook                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => readReducedMotion());
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Visibility hook — true when tab is foregrounded AND element is on screen.     */
/* Used to gate both rAF and polling so we burn no CPU/network when unseen.       */
/* ─────────────────────────────────────────────────────────────────────────── */

function useActiveVisibility(ref: React.RefObject<HTMLElement | null>): boolean {
  const [tabVisible, setTabVisible] = useState<boolean>(
    () => typeof document === "undefined" || !document.hidden,
  );
  // Default to true when IntersectionObserver is unavailable (e.g. SSR/old
  // browsers) so the map still animates; the effect narrows it once observed.
  const [onScreen, setOnScreen] = useState<boolean>(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const onVisibility = (): void => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setOnScreen(entry.isIntersecting);
      },
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return tabVisible && onScreen;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Component                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

type CarPoint = { n: number; x: number; y: number };

interface DriverMeta {
  acronym: string;
  colour: string; // hex without '#'
}

export default function TrackMap(): React.ReactElement {
  const reducedMotion = usePrefersReducedMotion();

  const bandRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const active = useActiveVisibility(bandRef);

  const [mode, setMode] = useState<TrackMode>("static");
  const [stateData, setStateData] = useState<StateResponse | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [liveCars, setLiveCars] = useState<LiveCar[]>([]);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Mutable render inputs read by the rAF loop without re-subscribing it.
  const circuitRef = useRef<CircuitGeometry>(FALLBACK_CIRCUIT);
  const framesRef = useRef<ReplayFrame[]>([]);
  const driverMetaRef = useRef<Map<number, DriverMeta>>(new Map());
  const liveCarsRef = useRef<LiveCar[]>([]);
  const modeRef = useRef<TrackMode>("static");
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  /* ── 1. Fetch mode/state on mount ─────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadState(): Promise<void> {
      try {
        const response = await fetch("/api/openf1/state", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`state ${response.status}`);
        const parsed = parseStateResponse(await response.json());
        if (cancelled) return;
        setStateData(parsed);
        setMode(parsed.mode);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        // Any failure → static silhouette + (unknown) countdown. Never error out.
        setStateData({
          mode: "static",
          session: null,
          nextRace: null,
          liveCredentialPresent: false,
        });
        setMode("static");
        if (error instanceof Error && error.name !== "AbortError") {
          console.warn("[Gridlock] TrackMap state fetch failed; using static.", error.message);
        }
      }
    }

    void loadState();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  modeRef.current = mode;

  /* ── 2. Replay mode → fetch frames once ───────────────────────────────────── */
  const replaySessionKey =
    mode === "replay" && stateData?.session ? stateData.session.sessionKey : null;

  useEffect(() => {
    if (replaySessionKey === null) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadReplay(key: number): Promise<void> {
      try {
        const response = await fetch(`/api/openf1/replay?sessionKey=${key}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`replay ${response.status}`);
        const parsed = parseReplayResponse(await response.json());
        if (cancelled) return;

        // Empty geometry / no frames → fall back to static.
        if (parsed.circuit === null || parsed.frames.length === 0) {
          setMode("static");
          return;
        }
        setReplay(parsed);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        setMode("static");
        if (error instanceof Error && error.name !== "AbortError") {
          console.warn("[Gridlock] TrackMap replay fetch failed; using static.", error.message);
        }
      }
    }

    void loadReplay(replaySessionKey);
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [replaySessionKey]);

  /* ── 3. Live mode → poll positions (paused when inactive) ─────────────────── */
  const liveSessionKey =
    mode === "live" && stateData?.session ? stateData.session.sessionKey : null;

  useEffect(() => {
    if (liveSessionKey === null || !active) return;
    let cancelled = false;
    let timer: number | null = null;
    const controller = new AbortController();

    async function poll(key: number): Promise<void> {
      try {
        const response = await fetch(`/api/openf1/live?sessionKey=${key}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`live ${response.status}`);
        const parsed = parseLiveResponse(await response.json());
        if (!cancelled) setLiveCars(parsed.cars);
      } catch (error) {
        if (controller.signal.aborted || cancelled) return;
        // Keep the last known positions; do not error the module.
        if (error instanceof Error && error.name !== "AbortError") {
          console.warn("[Gridlock] TrackMap live poll failed; holding last frame.", error.message);
        }
      }
    }

    void poll(liveSessionKey);
    timer = window.setInterval(() => void poll(liveSessionKey), LIVE_POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== null) window.clearInterval(timer);
    };
  }, [liveSessionKey, active]);

  /* ── Sync derived inputs into refs the render loop reads ──────────────────── */
  useEffect(() => {
    circuitRef.current =
      mode === "replay" && replay?.circuit ? replay.circuit : FALLBACK_CIRCUIT;
    framesRef.current = mode === "replay" && replay ? replay.frames : [];

    const meta = new Map<number, DriverMeta>();
    if (replay) {
      for (const driver of replay.drivers) {
        meta.set(driver.driverNumber, {
          acronym: driver.acronym,
          colour: driver.teamColour,
        });
      }
    }
    driverMetaRef.current = meta;
  }, [mode, replay]);

  useEffect(() => {
    liveCarsRef.current = liveCars;
  }, [liveCars]);

  /* ── 4. Static countdown ticker (functional — always allowed) ─────────────── */
  useEffect(() => {
    if (mode !== "static" || !active) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [mode, active]);

  /* ── 5. Canvas sizing (DPR-capped, ResizeObserver) ────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const band = bandRef.current;
    if (canvas === null || band === null) return;

    const applySize = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };

    applySize();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applySize());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  /* ── 6. Render loop ───────────────────────────────────────────────────────── */
  // Live/replay animate via rAF (gated by `active` + reduced-motion). Static and
  // reduced-motion draw a single frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const animate = (mode === "replay" || mode === "live") && !reducedMotion && active;
    let raf: number | null = null;
    let startTs: number | null = null;

    const renderOnce = (clockMs: number): void => {
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) return;
      drawScene(ctx, w, h, {
        circuit: circuitRef.current,
        mode: modeRef.current,
        cars: resolveCars(modeRef.current, framesRef.current, liveCarsRef.current, clockMs),
        driverMeta: driverMetaRef.current,
      });
    };

    if (!animate) {
      // Single static frame. For replay/live with reduced motion, show the first
      // (or last known) positions without a loop.
      renderOnce(0);
      return;
    }

    const tick = (ts: number): void => {
      if (startTs === null) startTs = ts;
      renderOnce((ts - startTs) * REPLAY_PLAYBACK_RATE);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [mode, reducedMotion, active, replay, liveCars]);

  /* ── Header content ───────────────────────────────────────────────────────── */
  const headerTitle = useMemo<string>(() => {
    if (mode === "static") return stateData?.nextRace?.name ?? "Next Race";
    const session = stateData?.session;
    if (session) {
      return session.circuitShortName ?? session.countryName ?? session.sessionName;
    }
    return "Circuit";
  }, [mode, stateData]);

  const headerSub = useMemo<string>(() => {
    if (mode === "live") return stateData?.session?.sessionName ?? "Live Session";
    if (mode === "replay") {
      const session = stateData?.session;
      return session ? `${session.sessionName} · Replay` : "Replay";
    }
    const round = stateData?.nextRace?.round;
    return round !== null && round !== undefined ? `Round ${round}` : "Upcoming";
  }, [mode, stateData]);

  const leaderName = useMemo<string | null>(() => {
    if (mode !== "live" || liveCars.length === 0) return null;
    const sorted = [...liveCars]
      .filter((car) => car.position !== null)
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const leader = sorted[0];
    if (!leader) return null;
    const meta = driverMetaRef.current.get(leader.n);
    return meta?.acronym ?? `#${leader.n}`;
  }, [mode, liveCars]);

  const countdownText = formatCountdown(stateData?.nextRace?.startsAtIso ?? null, nowMs);

  const pillClass =
    mode === "live" ? styles.pillLive : mode === "replay" ? styles.pillReplay : "";
  const pillLabel = mode === "live" ? "Live" : mode === "replay" ? "Replay" : "Standby";

  const ariaLabel =
    mode === "static"
      ? `Circuit map. Next race ${headerTitle}, starting in ${countdownText}.`
      : `${mode === "live" ? "Live" : "Replay"} track map for ${headerTitle}.`;

  return (
    <section
      ref={bandRef}
      className={styles.band}
      data-mode={mode}
      aria-label="Track map"
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>Trackside</span>
          <span className={styles.title}>{headerTitle}</span>
          <span className={styles.sub}>{headerSub}</span>
        </div>
        <span className={`${styles.pill} ${pillClass}`}>
          <span className={styles.dot} />
          {pillLabel}
        </span>
      </div>

      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={ariaLabel} />
      </div>

      {mode === "static" ? (
        <div className={styles.countdown}>
          <span className={styles.countdownValue}>{countdownText}</span>
          <span className={styles.countdownLabel}>To Lights Out</span>
        </div>
      ) : leaderName !== null ? (
        <div className={styles.leader}>
          <span className={styles.leaderTag}>Leader</span>
          <span className={styles.leaderName}>{leaderName}</span>
        </div>
      ) : null}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Frame interpolation — turn ~2Hz recorded frames into smooth motion.           */
/* Loops the recording; for live we use the latest poll directly (no interp).    */
/* ─────────────────────────────────────────────────────────────────────────── */

function resolveCars(
  mode: TrackMode,
  frames: ReplayFrame[],
  liveCars: LiveCar[],
  clockMs: number,
): CarPoint[] {
  if (mode === "live") {
    return liveCars.map((car) => ({ n: car.n, x: car.x, y: car.y }));
  }
  if (mode !== "replay" || frames.length === 0) return [];

  const duration = frames[frames.length - 1].t || 1;
  const loopT = duration > 0 ? clockMs % duration : 0;

  // Binary-search the surrounding frames, then lerp each car by number.
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < loopT) lo = mid + 1;
    else hi = mid;
  }
  const nextIdx = lo;
  const prevIdx = Math.max(0, nextIdx - 1);
  const prev = frames[prevIdx];
  const next = frames[nextIdx];
  const span = Math.max(1, next.t - prev.t);
  const alpha = next.t === prev.t ? 0 : Math.min(1, Math.max(0, (loopT - prev.t) / span));

  const nextByNum = new Map<number, ReplayCar>();
  for (const car of next.cars) nextByNum.set(car.n, car);

  const out: CarPoint[] = [];
  for (const car of prev.cars) {
    const target = nextByNum.get(car.n);
    if (target) {
      out.push({
        n: car.n,
        x: car.x + (target.x - car.x) * alpha,
        y: car.y + (target.y - car.y) * alpha,
      });
    } else {
      out.push({ n: car.n, x: car.x, y: car.y });
    }
  }
  // Cars that appear only in the `next` frame (entered mid-window).
  const prevNums = new Set(prev.cars.map((car) => car.n));
  for (const car of next.cars) {
    if (!prevNums.has(car.n)) out.push({ n: car.n, x: car.x, y: car.y });
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Canvas drawing                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

interface SceneInput {
  circuit: CircuitGeometry;
  mode: TrackMode;
  cars: CarPoint[];
  driverMeta: Map<number, DriverMeta>;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: SceneInput,
): void {
  ctx.clearRect(0, 0, width, height);

  const projector = makeProjector(scene.circuit.bounds, width, height);

  drawTrack(ctx, scene.circuit, projector);

  // Cars share the circuit's coordinate space (OpenF1 location units).
  for (const car of scene.cars) {
    const [px, py] = projector.toCanvas(car.x, car.y);
    const meta = scene.driverMeta.get(car.n);
    const colour = meta ? `#${meta.colour}` : "#FFFFFF";
    drawCar(ctx, px, py, colour, car.n);
  }

  // When there are no cars (static / fully-gated), the clean silhouette stands
  // alone — that is the intended "standby" look.
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  circuit: CircuitGeometry,
  projector: Projector,
): void {
  const points = circuit.points;
  if (points.length < 2) return;

  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const [px, py] = projector.toCanvas(points[i][0], points[i][1]);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Soft underlay glow.
  ctx.strokeStyle = TRACK_STROKE_GLOW;
  ctx.lineWidth = 9;
  ctx.stroke();

  // Crisp racing line.
  ctx.strokeStyle = TRACK_STROKE;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colour: string,
  number: number,
): void {
  const radius = 8;

  // Halo.
  ctx.beginPath();
  ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(colour, 0.22);
  ctx.fill();

  // Dot.
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.stroke();

  // Driver number.
  ctx.fillStyle = readableTextOn(colour);
  ctx.font = "700 9px 'Titillium Web', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), x, y + 0.5);
}

/* Colour utilities (no `any`; defensive parsing of a #RRGGBB string). */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace(/^#/, "");
  const valid = /^[0-9a-fA-F]{6}$/.test(clean) ? clean : "FFFFFF";
  return {
    r: parseInt(valid.slice(0, 2), 16),
    g: parseInt(valid.slice(2, 4), 16),
    b: parseInt(valid.slice(4, 6), 16),
  };
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function readableTextOn(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  // Relative luminance — pick black text on light dots, white on dark.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000000" : "#FFFFFF";
}
