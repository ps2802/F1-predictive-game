// SERVER-ONLY MODULE.
// Every export here calls the OpenF1 API with a server-side credential and must
// never be imported into a Client Component or shipped to the browser. We do NOT
// import the npm 'server-only' package because it breaks vitest; this header
// comment is the guard. OpenF1 is unofficial data — no logos/marks are used,
// only driver numbers + team colours.

import { buildFallbackNextRace } from "@/lib/races";

const OPENF1_BASE_URL = "https://api.openf1.org/v1";

// OpenF1 timestamps are session-relative; we grace-extend the live window so a
// session that just ended is still treated as live for a few minutes while the
// final telemetry settles.
const LIVE_GRACE_MS = 15 * 60 * 1000;

// Replay window: a bounded slice (~90s) inside the session, enough to cover at
// least one lap while keeping the payload small.
const REPLAY_WINDOW_MS = 90 * 1000;

// Target sample rate for decimated frames (~2Hz => one bucket every 500ms).
const FRAME_BUCKET_MS = 500;

// We only ever warn about the missing live credential once per process.
let warnedAboutMissingKey = false;

export type OpenF1Mode = "live" | "replay" | "static";

export type OpenF1SessionInfo = {
  sessionKey: number;
  sessionName: string;
  sessionType: string;
  circuitShortName: string | null;
  countryName: string | null;
  year: number;
};

export type OpenF1NextRace = {
  name: string;
  round: number | null;
  startsAtIso: string | null;
};

export type OpenF1StateResult = {
  mode: OpenF1Mode;
  session: OpenF1SessionInfo | null;
  nextRace: OpenF1NextRace | null;
  liveCredentialPresent: boolean;
  reason?: string;
};

export type OpenF1Driver = {
  driverNumber: number;
  acronym: string;
  // Hex WITHOUT a leading '#'. The client prefixes '#'.
  teamColour: string;
};

export type ReplayPoint = [number, number];

export type ReplayCircuit = {
  points: ReplayPoint[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type ReplayCar = { n: number; x: number; y: number };

export type ReplayFrame = { t: number; cars: ReplayCar[] };

export type ReplayBundle = {
  circuit: ReplayCircuit | null;
  drivers: OpenF1Driver[];
  frames: ReplayFrame[];
  durationMs: number;
};

export type LiveCar = {
  n: number;
  x: number;
  y: number;
  position: number | null;
};

export type LivePositionsResult = {
  cars: LiveCar[];
  updatedAtIso: string;
};

// ---------------------------------------------------------------------------
// Raw OpenF1 payload shapes (only the fields we read).
// ---------------------------------------------------------------------------

type RawSession = {
  session_key?: unknown;
  session_name?: unknown;
  session_type?: unknown;
  circuit_short_name?: unknown;
  country_name?: unknown;
  year?: unknown;
  date_start?: unknown;
  date_end?: unknown;
};

type RawDriver = {
  driver_number?: unknown;
  name_acronym?: unknown;
  team_colour?: unknown;
};

type RawLocation = {
  driver_number?: unknown;
  x?: unknown;
  y?: unknown;
  date?: unknown;
};

type RawPosition = {
  driver_number?: unknown;
  position?: unknown;
  date?: unknown;
};

// ---------------------------------------------------------------------------
// Internal fetch — injects the Bearer header when a key is present, uses Next
// fetch caching, and NEVER throws. On a non-OK/gated/error response it returns
// a typed empty result so callers can degrade gracefully.
// ---------------------------------------------------------------------------

type FetchResult<T> = { ok: true; data: T[] } | { ok: false; status: number };

function hasCredential(): boolean {
  return typeof process.env.OPENF1_API_KEY === "string" && process.env.OPENF1_API_KEY.length > 0;
}

function warnMissingKeyOnce(): void {
  if (warnedAboutMissingKey) {
    return;
  }
  warnedAboutMissingKey = true;
  console.warn(
    "[Gridlock] OpenF1 live mode idle: OPENF1_API_KEY not set; using replay/static."
  );
}

async function fetchOpenF1<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, string | number>,
  revalidateSeconds: number
): Promise<FetchResult<T>> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value));
  }
  const url = `${OPENF1_BASE_URL}/${endpoint}?${query.toString()}`;

  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.OPENF1_API_KEY;
  if (typeof key === "string" && key.length > 0) {
    headers.Authorization = `Bearer ${key}`;
  }

  try {
    const response = await fetch(url, {
      headers,
      next: { revalidate: revalidateSeconds },
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    const json: unknown = await response.json();
    if (!Array.isArray(json)) {
      return { ok: false, status: 0 };
    }

    return { ok: true, data: json as T[] };
  } catch {
    // Network errors, JSON parse failures, aborted fetches — all degrade to
    // "unavailable" rather than crashing the caller.
    return { ok: false, status: 0 };
  }
}

// ---------------------------------------------------------------------------
// Coercion helpers — OpenF1 fields are loosely typed; narrow from unknown.
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function parseSession(raw: RawSession): OpenF1SessionInfo | null {
  const sessionKey = toFiniteNumber(raw.session_key);
  const year = toFiniteNumber(raw.year);
  if (sessionKey === null) {
    return null;
  }
  return {
    sessionKey,
    sessionName: toNonEmptyString(raw.session_name) ?? "Session",
    sessionType: toNonEmptyString(raw.session_type) ?? "Unknown",
    circuitShortName: toNonEmptyString(raw.circuit_short_name),
    countryName: toNonEmptyString(raw.country_name),
    year: year ?? new Date().getUTCFullYear(),
  };
}

function isLiveNow(raw: RawSession, now: Date): boolean {
  const start = toNonEmptyString(raw.date_start);
  const end = toNonEmptyString(raw.date_end);
  if (!start || !end) {
    return false;
  }
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return false;
  }
  const nowMs = now.getTime();
  return nowMs >= startMs && nowMs <= endMs + LIVE_GRACE_MS;
}

function sessionSortKey(raw: RawSession): number {
  const start = toNonEmptyString(raw.date_start);
  if (start) {
    const ms = new Date(start).getTime();
    if (Number.isFinite(ms)) {
      return ms;
    }
  }
  return toFiniteNumber(raw.session_key) ?? 0;
}

// Race > Sprint > Qualifying for replay selection. Higher rank wins ties.
function replayRank(sessionType: string): number {
  const type = sessionType.toLowerCase();
  if (type.includes("race")) {
    return 3;
  }
  if (type.includes("sprint")) {
    return 2;
  }
  if (type.includes("qualifying")) {
    return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// nextRace — read from OUR own races data; never invent races.
// ---------------------------------------------------------------------------

function resolveNextRace(now: Date): OpenF1NextRace | null {
  const summary = buildFallbackNextRace(now);
  if (!summary) {
    return null;
  }
  return {
    name: summary.grand_prix_name,
    round: summary.round,
    startsAtIso: summary.race_starts_at,
  };
}

// ---------------------------------------------------------------------------
// resolveOpenF1State — determines mode + latest/last session + nextRace.
// ---------------------------------------------------------------------------

export async function resolveOpenF1State(now: Date = new Date()): Promise<OpenF1StateResult> {
  const liveCredentialPresent = hasCredential();
  const nextRace = resolveNextRace(now);

  if (!liveCredentialPresent) {
    warnMissingKeyOnce();
  }

  const year = now.getUTCFullYear();
  const sessionsResult = await fetchOpenF1<RawSession>("sessions", { year }, 30);

  // If sessions are gated/unavailable, we cannot detect live or pick a replay
  // session — fall back to a clean static frame with our own countdown.
  if (!sessionsResult.ok || sessionsResult.data.length === 0) {
    return {
      mode: "static",
      session: null,
      nextRace,
      liveCredentialPresent,
      reason: sessionsResult.ok
        ? "no_sessions_for_year"
        : `sessions_unavailable_status_${sessionsResult.status}`,
    };
  }

  const sessions = sessionsResult.data;
  const sorted = [...sessions].sort((a, b) => sessionSortKey(b) - sessionSortKey(a));
  const latestRaw = sorted[0];

  // 1. Is the latest session live right now?
  if (isLiveNow(latestRaw, now)) {
    const session = parseSession(latestRaw);
    if (liveCredentialPresent && session) {
      return { mode: "live", session, nextRace, liveCredentialPresent };
    }
    // Live but no credential: OpenF1 gates ALL endpoints (even historical)
    // during a live session, so we cannot read replay data either -> static.
    return {
      mode: "static",
      session,
      nextRace,
      liveCredentialPresent,
      reason: "live_session_no_credential",
    };
  }

  // 2. Not live — pick the most recent COMPLETED session for replay,
  // preferring Race, then Sprint, then Qualifying. Among equal-ranked types,
  // prefer the most recent.
  let best: RawSession | null = null;
  let bestRank = -1;
  let bestSortKey = -Infinity;
  for (const raw of sessions) {
    const type = toNonEmptyString(raw.session_type) ?? "";
    const rank = replayRank(type);
    if (rank <= 0) {
      continue;
    }
    const sortKey = sessionSortKey(raw);
    if (rank > bestRank || (rank === bestRank && sortKey > bestSortKey)) {
      best = raw;
      bestRank = rank;
      bestSortKey = sortKey;
    }
  }

  const replaySession = parseSession(best ?? latestRaw);
  if (replaySession) {
    return { mode: "replay", session: replaySession, nextRace, liveCredentialPresent };
  }

  return {
    mode: "static",
    session: null,
    nextRace,
    liveCredentialPresent,
    reason: "no_replayable_session",
  };
}

// ---------------------------------------------------------------------------
// getSessionDrivers — [{driverNumber, acronym, teamColour}] from /drivers.
// ---------------------------------------------------------------------------

export async function getSessionDrivers(sessionKey: number): Promise<OpenF1Driver[]> {
  const result = await fetchOpenF1<RawDriver>("drivers", { session_key: sessionKey }, 86400);
  if (!result.ok) {
    return [];
  }

  const seen = new Set<number>();
  const drivers: OpenF1Driver[] = [];
  for (const raw of result.data) {
    const driverNumber = toFiniteNumber(raw.driver_number);
    if (driverNumber === null || seen.has(driverNumber)) {
      continue;
    }
    seen.add(driverNumber);
    const acronym = toNonEmptyString(raw.name_acronym) ?? String(driverNumber);
    const teamColour = (toNonEmptyString(raw.team_colour) ?? "9CA3AF").replace(/^#/, "");
    drivers.push({ driverNumber, acronym, teamColour });
  }
  return drivers;
}

// ---------------------------------------------------------------------------
// Replay bundle construction helpers.
// ---------------------------------------------------------------------------

type LocationSample = { n: number; x: number; y: number; t: number };

function parseLocationSamples(rows: RawLocation[]): LocationSample[] {
  const samples: LocationSample[] = [];
  for (const raw of rows) {
    const n = toFiniteNumber(raw.driver_number);
    const x = toFiniteNumber(raw.x);
    const y = toFiniteNumber(raw.y);
    const dateStr = toNonEmptyString(raw.date);
    if (n === null || x === null || y === null || dateStr === null) {
      continue;
    }
    // OpenF1 emits (0,0) sentinels when a car is in the pit/garage; skip them so
    // they don't collapse the circuit outline to the origin.
    if (x === 0 && y === 0) {
      continue;
    }
    const t = new Date(dateStr).getTime();
    if (!Number.isFinite(t)) {
      continue;
    }
    samples.push({ n, x, y, t });
  }
  return samples;
}

// Builds the circuit outline from one reference driver's ordered trace, with a
// light min-distance dedup so we don't ship thousands of near-identical points.
function buildCircuitFromTrace(
  trace: LocationSample[],
  minStep = 30
): ReplayCircuit | null {
  if (trace.length < 8) {
    return null;
  }
  const ordered = [...trace].sort((a, b) => a.t - b.t);
  const points: ReplayPoint[] = [];
  let lastX = Number.NaN;
  let lastY = Number.NaN;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const sample of ordered) {
    const dx = sample.x - lastX;
    const dy = sample.y - lastY;
    const farEnough =
      Number.isNaN(lastX) || Math.hypot(dx, dy) >= minStep;
    if (farEnough) {
      points.push([sample.x, sample.y]);
      lastX = sample.x;
      lastY = sample.y;
    }
    minX = Math.min(minX, sample.x);
    minY = Math.min(minY, sample.y);
    maxX = Math.max(maxX, sample.x);
    maxY = Math.max(maxY, sample.y);
  }

  if (points.length < 8) {
    return null;
  }

  return { points, bounds: { minX, minY, maxX, maxY } };
}

// Buckets all drivers' samples into ~FRAME_BUCKET_MS frames relative to the
// window start. Within a bucket, the last sample per driver wins.
function buildFrames(samples: LocationSample[], windowStart: number): ReplayFrame[] {
  const byBucket = new Map<number, Map<number, ReplayCar>>();
  for (const sample of samples) {
    const bucket = Math.floor((sample.t - windowStart) / FRAME_BUCKET_MS);
    let cars = byBucket.get(bucket);
    if (!cars) {
      cars = new Map<number, ReplayCar>();
      byBucket.set(bucket, cars);
    }
    cars.set(sample.n, {
      n: sample.n,
      x: Math.round(sample.x),
      y: Math.round(sample.y),
    });
  }

  return [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, cars]) => ({
      t: bucket * FRAME_BUCKET_MS,
      cars: [...cars.values()].sort((a, b) => a.n - b.n),
    }));
}

// ---------------------------------------------------------------------------
// buildReplayBundle — circuit + decimated frames over a bounded window.
// ---------------------------------------------------------------------------

export async function buildReplayBundle(sessionKey: number): Promise<ReplayBundle> {
  const drivers = await getSessionDrivers(sessionKey);

  const locationResult = await fetchOpenF1<RawLocation>(
    "location",
    { session_key: sessionKey },
    86400
  );

  const emptyBundle: ReplayBundle = {
    circuit: null,
    drivers,
    frames: [],
    durationMs: 0,
  };

  if (!locationResult.ok || locationResult.data.length === 0) {
    return emptyBundle;
  }

  const allSamples = parseLocationSamples(locationResult.data);
  if (allSamples.length === 0) {
    return emptyBundle;
  }

  // Bound the window: start at the first sample, keep ~REPLAY_WINDOW_MS.
  const firstT = allSamples.reduce((min, s) => Math.min(min, s.t), Infinity);
  const windowStart = firstT;
  const windowEnd = firstT + REPLAY_WINDOW_MS;
  const windowSamples = allSamples.filter((s) => s.t >= windowStart && s.t <= windowEnd);

  if (windowSamples.length === 0) {
    return emptyBundle;
  }

  // Pick the reference driver with the most samples in-window for the outline.
  const countByDriver = new Map<number, number>();
  for (const sample of windowSamples) {
    countByDriver.set(sample.n, (countByDriver.get(sample.n) ?? 0) + 1);
  }
  let referenceDriver = windowSamples[0].n;
  let referenceCount = -1;
  for (const [driver, count] of countByDriver.entries()) {
    if (count > referenceCount) {
      referenceDriver = driver;
      referenceCount = count;
    }
  }

  const referenceTrace = windowSamples.filter((s) => s.n === referenceDriver);
  const circuit = buildCircuitFromTrace(referenceTrace);
  const frames = buildFrames(windowSamples, windowStart);

  if (circuit === null || frames.length === 0) {
    return { circuit, drivers, frames, durationMs: 0 };
  }

  const durationMs = frames[frames.length - 1].t + FRAME_BUCKET_MS;

  return { circuit, drivers, frames, durationMs };
}

// ---------------------------------------------------------------------------
// getLivePositions — latest /location + /position (credential-gated).
// ---------------------------------------------------------------------------

export async function getLivePositions(sessionKey: number): Promise<LivePositionsResult> {
  const updatedAtIso = new Date().toISOString();

  if (!hasCredential()) {
    warnMissingKeyOnce();
    return { cars: [], updatedAtIso };
  }

  const [locationResult, positionResult] = await Promise.all([
    fetchOpenF1<RawLocation>("location", { session_key: sessionKey }, 0),
    fetchOpenF1<RawPosition>("position", { session_key: sessionKey }, 0),
  ]);

  if (!locationResult.ok || locationResult.data.length === 0) {
    return { cars: [], updatedAtIso };
  }

  // Latest position per driver number.
  const positionByDriver = new Map<number, number>();
  if (positionResult.ok) {
    const latestPosDate = new Map<number, number>();
    for (const raw of positionResult.data) {
      const n = toFiniteNumber(raw.driver_number);
      const position = toFiniteNumber(raw.position);
      const dateStr = toNonEmptyString(raw.date);
      if (n === null || position === null) {
        continue;
      }
      const t = dateStr ? new Date(dateStr).getTime() : 0;
      const prior = latestPosDate.get(n);
      if (prior === undefined || t >= prior) {
        latestPosDate.set(n, t);
        positionByDriver.set(n, position);
      }
    }
  }

  // Latest location per driver number.
  const latestByDriver = new Map<number, LiveCar>();
  const latestLocDate = new Map<number, number>();
  for (const raw of locationResult.data) {
    const n = toFiniteNumber(raw.driver_number);
    const x = toFiniteNumber(raw.x);
    const y = toFiniteNumber(raw.y);
    const dateStr = toNonEmptyString(raw.date);
    if (n === null || x === null || y === null || dateStr === null) {
      continue;
    }
    const t = new Date(dateStr).getTime();
    if (!Number.isFinite(t)) {
      continue;
    }
    const prior = latestLocDate.get(n);
    if (prior === undefined || t >= prior) {
      latestLocDate.set(n, t);
      latestByDriver.set(n, {
        n,
        x: Math.round(x),
        y: Math.round(y),
        position: positionByDriver.get(n) ?? null,
      });
    }
  }

  const cars = [...latestByDriver.values()].sort((a, b) => a.n - b.n);
  return { cars, updatedAtIso };
}
