import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReplayBundle,
  getLivePositions,
  getSessionDrivers,
  resolveOpenF1State,
} from "../lib/openf1";

// ---------------------------------------------------------------------------
// fetch stub harness — NO network. Routes by endpoint name in the URL.
// ---------------------------------------------------------------------------

type Handler = (url: URL, init?: RequestInit) => { status?: number; body: unknown };

function installFetch(handlers: Record<string, Handler>): void {
  const stub = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl);
    // Path looks like /v1/<endpoint>
    const endpoint = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const handler = handlers[endpoint];
    if (!handler) {
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", stub);
}

function getAuthHeaderFrom(init?: RequestInit): string | null {
  const headers = init?.headers as Record<string, string> | undefined;
  if (!headers) {
    return null;
  }
  return headers.Authorization ?? headers.authorization ?? null;
}

const NOW = new Date("2026-05-03T14:30:00.000Z");

function liveSession(): Record<string, unknown> {
  return {
    session_key: 9999,
    session_name: "Race",
    session_type: "Race",
    circuit_short_name: "Miami",
    country_name: "United States",
    year: 2026,
    date_start: "2026-05-03T14:00:00.000Z",
    date_end: "2026-05-03T16:00:00.000Z",
  };
}

function completedRace(): Record<string, unknown> {
  return {
    session_key: 8001,
    session_name: "Race",
    session_type: "Race",
    circuit_short_name: "Suzuka",
    country_name: "Japan",
    year: 2026,
    date_start: "2026-03-29T05:00:00.000Z",
    date_end: "2026-03-29T07:00:00.000Z",
  };
}

function completedQualifying(): Record<string, unknown> {
  return {
    session_key: 8000,
    session_name: "Qualifying",
    session_type: "Qualifying",
    circuit_short_name: "Suzuka",
    country_name: "Japan",
    year: 2026,
    date_start: "2026-03-28T06:00:00.000Z",
    date_end: "2026-03-28T07:00:00.000Z",
  };
}

beforeEach(() => {
  delete process.env.OPENF1_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.OPENF1_API_KEY;
});

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

describe("resolveOpenF1State mode resolution", () => {
  it("returns live when a session is live AND the credential is present", async () => {
    process.env.OPENF1_API_KEY = "secret-key";
    let sawAuth: string | null = null;
    installFetch({
      sessions: (_url, init) => {
        sawAuth = getAuthHeaderFrom(init);
        return { body: [liveSession()] };
      },
    });

    const state = await resolveOpenF1State(NOW);

    expect(state.mode).toBe("live");
    expect(state.liveCredentialPresent).toBe(true);
    expect(state.session?.sessionKey).toBe(9999);
    expect(state.session?.circuitShortName).toBe("Miami");
    // Bearer header injected when key is set.
    expect(sawAuth).toBe("Bearer secret-key");
  });

  it("degrades to static when a session is live but NO credential is present", async () => {
    let sawAuth: string | null = "unset";
    installFetch({
      sessions: (_url, init) => {
        sawAuth = getAuthHeaderFrom(init);
        return { body: [liveSession()] };
      },
    });

    const state = await resolveOpenF1State(NOW);

    expect(state.mode).toBe("static");
    expect(state.liveCredentialPresent).toBe(false);
    expect(state.reason).toBe("live_session_no_credential");
    // Session info still surfaced for context; nextRace comes from our races.
    expect(state.session?.sessionKey).toBe(9999);
    expect(state.nextRace?.name).toBeTypeOf("string");
    // No Authorization header when the key is absent.
    expect(sawAuth).toBeNull();
  });

  it("returns replay (Race preferred) when no session is live", async () => {
    installFetch({
      sessions: () => ({ body: [completedQualifying(), completedRace()] }),
    });

    const state = await resolveOpenF1State(NOW);

    expect(state.mode).toBe("replay");
    // Race ranks above Qualifying for replay selection.
    expect(state.session?.sessionKey).toBe(8001);
    expect(state.session?.sessionType).toBe("Race");
  });

  it("falls back to replay-from-qualifying when no race exists", async () => {
    installFetch({
      sessions: () => ({ body: [completedQualifying()] }),
    });

    const state = await resolveOpenF1State(NOW);

    expect(state.mode).toBe("replay");
    expect(state.session?.sessionKey).toBe(8000);
  });

  it("returns static when ALL sessions are gated (403)", async () => {
    installFetch({
      sessions: () => ({ status: 403, body: { detail: "auth required" } }),
    });

    const state = await resolveOpenF1State(NOW);

    expect(state.mode).toBe("static");
    expect(state.session).toBeNull();
    expect(state.reason).toBe("sessions_unavailable_status_403");
    // nextRace still derived from our own races data for the countdown.
    expect(state.nextRace?.name).toBeTypeOf("string");
  });

  it("returns static when the sessions list is empty for the year", async () => {
    installFetch({
      sessions: () => ({ body: [] }),
    });

    const state = await resolveOpenF1State(NOW);

    expect(state.mode).toBe("static");
    expect(state.reason).toBe("no_sessions_for_year");
  });
});

// ---------------------------------------------------------------------------
// Driver parse
// ---------------------------------------------------------------------------

describe("getSessionDrivers", () => {
  it("parses driver number, acronym, and strips '#' from team colour", async () => {
    installFetch({
      drivers: () => ({
        body: [
          { driver_number: 4, name_acronym: "NOR", team_colour: "#FF8000" },
          { driver_number: 1, name_acronym: "VER", team_colour: "3671C6" },
          // Duplicate driver_number ignored.
          { driver_number: 4, name_acronym: "NOR", team_colour: "FF8000" },
        ],
      }),
    });

    const drivers = await getSessionDrivers(8001);

    expect(drivers).toHaveLength(2);
    expect(drivers[0]).toEqual({ driverNumber: 4, acronym: "NOR", teamColour: "FF8000" });
    expect(drivers[1].teamColour).toBe("3671C6");
    // teamColour never carries a leading '#'.
    expect(drivers.every((d) => !d.teamColour.startsWith("#"))).toBe(true);
  });

  it("returns [] gracefully when /drivers is gated", async () => {
    installFetch({
      drivers: () => ({ status: 403, body: {} }),
    });
    expect(await getSessionDrivers(8001)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Replay bundle build
// ---------------------------------------------------------------------------

function buildLocationFixture(): Record<string, unknown>[] {
  // One reference car (number 4) traces a square loop; a second car (1) tags
  // along. Samples are every 1s; the builder decimates to ~2Hz buckets.
  const base = new Date("2026-03-29T05:10:00.000Z").getTime();
  const path: Array<[number, number]> = [
    [0, 0],
    [1000, 0],
    [2000, 0],
    [2000, 1000],
    [2000, 2000],
    [1000, 2000],
    [0, 2000],
    [0, 1000],
    [0, 0],
    [1000, 0],
  ];
  const rows: Record<string, unknown>[] = [];
  path.forEach(([x, y], i) => {
    const date = new Date(base + i * 1000).toISOString();
    rows.push({ driver_number: 4, x: x + 1, y: y + 1, date });
    rows.push({ driver_number: 1, x: x + 50, y: y + 50, date });
  });
  return rows;
}

describe("buildReplayBundle", () => {
  it("builds a circuit outline + decimated frames from a small fixture", async () => {
    installFetch({
      drivers: () => ({
        body: [
          { driver_number: 4, name_acronym: "NOR", team_colour: "FF8000" },
          { driver_number: 1, name_acronym: "VER", team_colour: "3671C6" },
        ],
      }),
      location: () => ({ body: buildLocationFixture() }),
    });

    const bundle = await buildReplayBundle(8001);

    expect(bundle.drivers).toHaveLength(2);
    expect(bundle.circuit).not.toBeNull();
    expect(bundle.circuit!.points.length).toBeGreaterThanOrEqual(8);
    // Bounds span the square loop (origin sentinel (0,0) excluded by the +1 offset).
    expect(bundle.circuit!.bounds.maxX).toBeGreaterThan(bundle.circuit!.bounds.minX);
    expect(bundle.circuit!.bounds.maxY).toBeGreaterThan(bundle.circuit!.bounds.minY);

    expect(bundle.frames.length).toBeGreaterThan(0);
    expect(bundle.durationMs).toBeGreaterThan(0);
    // Each frame timestamp is relative to window start (first is 0).
    expect(bundle.frames[0].t).toBe(0);
    // Both cars appear in a populated frame.
    const populated = bundle.frames.find((f) => f.cars.length === 2);
    expect(populated).toBeDefined();
    expect(populated!.cars.map((c) => c.n).sort()).toEqual([1, 4]);
  });

  it("returns circuit:null and empty frames when /location is gated (403)", async () => {
    installFetch({
      drivers: () => ({ body: [{ driver_number: 4, name_acronym: "NOR", team_colour: "FF8000" }] }),
      location: () => ({ status: 403, body: {} }),
    });

    const bundle = await buildReplayBundle(8001);

    expect(bundle.circuit).toBeNull();
    expect(bundle.frames).toEqual([]);
    expect(bundle.durationMs).toBe(0);
    // Drivers still returned (came from a non-gated /drivers call here).
    expect(bundle.drivers).toHaveLength(1);
  });

  it("returns empty bundle when /location yields only pit sentinels", async () => {
    installFetch({
      drivers: () => ({ body: [] }),
      location: () => ({
        body: [
          { driver_number: 4, x: 0, y: 0, date: "2026-03-29T05:10:00.000Z" },
          { driver_number: 4, x: 0, y: 0, date: "2026-03-29T05:10:01.000Z" },
        ],
      }),
    });

    const bundle = await buildReplayBundle(8001);
    expect(bundle.circuit).toBeNull();
    expect(bundle.frames).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Live positions — credential gating + graceful empty
// ---------------------------------------------------------------------------

describe("getLivePositions", () => {
  it("returns empty cars (no 500) when no credential is present", async () => {
    const stub = vi.fn();
    vi.stubGlobal("fetch", stub);

    const result = await getLivePositions(9999);

    expect(result.cars).toEqual([]);
    expect(typeof result.updatedAtIso).toBe("string");
    // Must not have touched the network without a credential.
    expect(stub).not.toHaveBeenCalled();
  });

  it("returns latest location merged with position when credential present", async () => {
    process.env.OPENF1_API_KEY = "secret-key";
    installFetch({
      location: () => ({
        body: [
          { driver_number: 4, x: 10, y: 20, date: "2026-05-03T14:30:00.000Z" },
          // Newer sample wins.
          { driver_number: 4, x: 11, y: 21, date: "2026-05-03T14:30:01.000Z" },
          { driver_number: 1, x: 30, y: 40, date: "2026-05-03T14:30:01.000Z" },
        ],
      }),
      position: () => ({
        body: [
          { driver_number: 4, position: 1, date: "2026-05-03T14:30:01.000Z" },
          { driver_number: 1, position: 2, date: "2026-05-03T14:30:01.000Z" },
        ],
      }),
    });

    const result = await getLivePositions(9999);

    expect(result.cars).toHaveLength(2);
    const nor = result.cars.find((c) => c.n === 4);
    expect(nor).toEqual({ n: 4, x: 11, y: 21, position: 1 });
    const ver = result.cars.find((c) => c.n === 1);
    expect(ver?.position).toBe(2);
  });

  it("returns empty cars gracefully when /location is gated even with a key", async () => {
    process.env.OPENF1_API_KEY = "secret-key";
    installFetch({
      location: () => ({ status: 403, body: {} }),
      position: () => ({ status: 403, body: {} }),
    });

    const result = await getLivePositions(9999);
    expect(result.cars).toEqual([]);
  });
});
