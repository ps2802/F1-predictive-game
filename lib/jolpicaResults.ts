// Server-only: this module fetches the Jolpica F1 API with cache: "no-store"
// and is only imported by server API routes (see app/api/admin/results/sync).
// Do NOT import it from Client Components.

const JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1";

/**
 * Normalizes a driver full name for matching against stored prediction option
 * values. Jolpica returns accented names (e.g. "Sergio Pérez", "Nico
 * Hülkenberg") while the prediction options store plain ASCII ("Sergio Perez",
 * "Nico Hulkenberg"), so we strip diacritics and collapse whitespace/case.
 */
export function normalizeDriverName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type JolpicaDriver = {
  givenName?: string;
  familyName?: string;
};

type JolpicaQualifyingResult = {
  position?: string;
  Driver?: JolpicaDriver;
};

type JolpicaFastestLap = {
  rank?: string;
};

type JolpicaRaceResultEntry = {
  position?: string;
  positionText?: string;
  grid?: string;
  status?: string;
  Driver?: JolpicaDriver;
  FastestLap?: JolpicaFastestLap;
};

type JolpicaRaceNode = {
  QualifyingResults?: JolpicaQualifyingResult[];
  Results?: JolpicaRaceResultEntry[];
};

type JolpicaResultsResponse = {
  MRData?: {
    RaceTable?: {
      Races?: JolpicaRaceNode[];
    };
  };
};

export type QualifyingResultsSummary = {
  available: boolean;
  pole: string | null;
};

export type RaceResultsSummary = {
  available: boolean;
  winner: string | null;
  podium: [string, string, string] | null;
  fastestLap: string | null;
  finishingOrder: string[];
  dnfCount: number;
  biggestGainer: string | null;
};

function fullName(driver: JolpicaDriver | undefined): string | null {
  if (!driver) {
    return null;
  }
  const given = driver.givenName?.trim() ?? "";
  const family = driver.familyName?.trim() ?? "";
  const combined = `${given} ${family}`.trim();
  return combined.length > 0 ? combined : null;
}

/**
 * Fetches a Jolpica endpoint and returns the first race node, or null when the
 * data is not available yet (404, empty response, or no races). Never throws on
 * a missing/not-yet-published result — only on a genuine unexpected server
 * error so callers can surface it.
 */
async function fetchRaceNode(path: string): Promise<JolpicaRaceNode | null> {
  const response = await fetch(`${JOLPICA_BASE_URL}/${path}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Jolpica request failed with ${response.status} for ${path}.`);
  }

  const data = (await response.json()) as JolpicaResultsResponse;
  const races = data.MRData?.RaceTable?.Races;
  if (!Array.isArray(races) || races.length === 0) {
    return null;
  }

  return races[0];
}

/**
 * Returns the pole sitter for a given season+round, derived from the position-1
 * qualifying result. Returns { available: false } when qualifying has not been
 * published yet.
 */
export async function fetchQualifyingResults(
  season: number,
  round: number
): Promise<QualifyingResultsSummary> {
  const node = await fetchRaceNode(`${season}/${round}/qualifying.json`);
  const results = node?.QualifyingResults;

  if (!Array.isArray(results) || results.length === 0) {
    return { available: false, pole: null };
  }

  const poleEntry =
    results.find((entry) => entry.position === "1") ?? results[0];
  const pole = fullName(poleEntry?.Driver);

  return { available: pole != null, pole };
}

/** A finished result has a status of "Finished" or a lapped "+N Lap(s)" status. */
function isFinishedStatus(status: string | undefined): boolean {
  if (!status) {
    return false;
  }
  if (status === "Finished") {
    return true;
  }
  // Lapped finishers report e.g. "+1 Lap" / "+2 Laps".
  return /\+\d+\s+Lap/i.test(status);
}

/**
 * Returns the driver with the most positions gained (grid - finishing
 * position). Pit-lane / no-grid starts report grid "0"; we treat those as not
 * comparable and skip them so a pit-lane start doesn't dominate the metric.
 */
function computeBiggestGainer(results: JolpicaRaceResultEntry[]): string | null {
  let best: { name: string; gained: number } | null = null;

  for (const entry of results) {
    const grid = Number(entry.grid);
    const finish = Number(entry.position);
    if (!Number.isFinite(grid) || !Number.isFinite(finish) || grid <= 0 || finish <= 0) {
      continue;
    }
    const gained = grid - finish;
    const name = fullName(entry.Driver);
    if (name == null) {
      continue;
    }
    if (best == null || gained > best.gained) {
      best = { name, gained };
    }
  }

  return best?.name ?? null;
}

/**
 * Returns the parsed race results for a given season+round: winner, podium,
 * fastest lap, finishing order, DNF count, and biggest gainer. Returns
 * { available: false } when the race results have not been published yet.
 */
export async function fetchRaceResults(
  season: number,
  round: number
): Promise<RaceResultsSummary> {
  const node = await fetchRaceNode(`${season}/${round}/results.json`);
  const results = node?.Results;

  const empty: RaceResultsSummary = {
    available: false,
    winner: null,
    podium: null,
    fastestLap: null,
    finishingOrder: [],
    dnfCount: 0,
    biggestGainer: null,
  };

  if (!Array.isArray(results) || results.length === 0) {
    return empty;
  }

  const byPosition = [...results].sort(
    (a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)
  );

  const finishingOrder = byPosition
    .map((entry) => fullName(entry.Driver))
    .filter((name): name is string => name != null);

  const winner = fullName(byPosition[0]?.Driver);
  const p2 = fullName(byPosition[1]?.Driver);
  const p3 = fullName(byPosition[2]?.Driver);
  const podium: [string, string, string] | null =
    winner != null && p2 != null && p3 != null ? [winner, p2, p3] : null;

  const fastestLapEntry = results.find((entry) => entry.FastestLap?.rank === "1");
  const fastestLap = fullName(fastestLapEntry?.Driver);

  const dnfCount = results.filter((entry) => !isFinishedStatus(entry.status)).length;
  const biggestGainer = computeBiggestGainer(results);

  return {
    available: true,
    winner,
    podium,
    fastestLap,
    finishingOrder,
    dnfCount,
    biggestGainer,
  };
}
