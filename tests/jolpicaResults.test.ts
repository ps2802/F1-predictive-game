import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchQualifyingResults,
  fetchRaceResults,
  normalizeDriverName,
} from "../lib/jolpicaResults";

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function mockFetchOnce(payload: unknown, status = 200): void {
  const response: FetchResponse = {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response as unknown as Response)
  );
}

const qualifyingFixture = {
  MRData: {
    RaceTable: {
      Races: [
        {
          QualifyingResults: [
            { position: "1", Driver: { givenName: "Max", familyName: "Verstappen" } },
            { position: "2", Driver: { givenName: "Charles", familyName: "Leclerc" } },
          ],
        },
      ],
    },
  },
};

const raceFixture = {
  MRData: {
    RaceTable: {
      Races: [
        {
          Results: [
            {
              position: "1",
              grid: "1",
              status: "Finished",
              Driver: { givenName: "Max", familyName: "Verstappen" },
              FastestLap: { rank: "3" },
            },
            {
              position: "2",
              grid: "5",
              status: "Finished",
              // Accented name — must normalize to match "Sergio Perez".
              Driver: { givenName: "Sergio", familyName: "Pérez" },
              FastestLap: { rank: "1" },
            },
            {
              position: "3",
              grid: "4",
              status: "+1 Lap",
              Driver: { givenName: "Carlos", familyName: "Sainz" },
              FastestLap: { rank: "6" },
            },
            {
              position: "4",
              grid: "18",
              status: "Finished",
              Driver: { givenName: "Lando", familyName: "Norris" },
              FastestLap: { rank: "2" },
            },
            {
              position: "5",
              grid: "10",
              status: "Engine",
              Driver: { givenName: "Lewis", familyName: "Hamilton" },
            },
          ],
        },
      ],
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeDriverName", () => {
  it("strips diacritics, case, and extra whitespace", () => {
    expect(normalizeDriverName("Sergio Pérez")).toBe(normalizeDriverName("Sergio Perez"));
    expect(normalizeDriverName("Nico  Hülkenberg")).toBe(normalizeDriverName("Nico Hulkenberg"));
  });
});

describe("fetchQualifyingResults", () => {
  it("returns the position-1 driver as the pole sitter", async () => {
    mockFetchOnce(qualifyingFixture);
    const result = await fetchQualifyingResults(2026, 1);
    expect(result).toEqual({ available: true, pole: "Max Verstappen" });
  });

  it("returns not-available on a 404 without throwing", async () => {
    mockFetchOnce({}, 404);
    const result = await fetchQualifyingResults(2026, 99);
    expect(result).toEqual({ available: false, pole: null });
  });
});

describe("fetchRaceResults", () => {
  it("parses winner, podium, fastest lap, DNF count, and biggest gainer", async () => {
    mockFetchOnce(raceFixture);
    const result = await fetchRaceResults(2026, 1);

    expect(result.available).toBe(true);
    expect(result.winner).toBe("Max Verstappen");
    // Podium is [P1, P2, P3].
    expect(result.podium).toEqual(["Max Verstappen", "Sergio Pérez", "Carlos Sainz"]);
    // Fastest lap is the entry whose FastestLap.rank === "1".
    expect(result.fastestLap).toBe("Sergio Pérez");
    // Only "Engine" (Hamilton) is a non-finish; lapped "+1 Lap" counts as finished.
    expect(result.dnfCount).toBe(1);
    // Norris gained 18 - 4 = 14 positions, the most in the field.
    expect(result.biggestGainer).toBe("Lando Norris");
    expect(result.finishingOrder[0]).toBe("Max Verstappen");
  });

  it("returns not-available on a 404 without throwing", async () => {
    mockFetchOnce({}, 404);
    const result = await fetchRaceResults(2026, 99);
    expect(result.available).toBe(false);
    expect(result.podium).toBeNull();
    expect(result.dnfCount).toBe(0);
  });

  it("returns not-available when the race node has no results yet", async () => {
    mockFetchOnce({ MRData: { RaceTable: { Races: [] } } });
    const result = await fetchRaceResults(2026, 5);
    expect(result.available).toBe(false);
  });
});
