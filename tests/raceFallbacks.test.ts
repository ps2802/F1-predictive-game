import { describe, expect, it } from "vitest";
import {
  buildFallbackNextRace,
  buildFallbackRaceRecord,
  buildFallbackRaceTiming,
  findRaceById,
} from "../lib/races";

describe("race fallbacks", () => {
  it("finds static races by id", () => {
    expect(findRaceById("usa-2026")?.name).toBe("Miami Grand Prix");
  });

  it("builds a fallback race record for known races", () => {
    expect(buildFallbackRaceRecord("usa-2026")).toMatchObject({
      id: "usa-2026",
      round: 4,
      grand_prix_name: "Miami Grand Prix",
      race_date: "2026-05-03",
    });
  });

  it("builds fallback timing without a raw TBD placeholder", () => {
    expect(buildFallbackRaceTiming("usa-2026")).toEqual({
      qualifying_starts_at: null,
      race_starts_at: "2026-05-03T00:00:00.000Z",
      quali_locked: false,
      race_locked: false,
    });
  });

  it("picks the next non-cancelled fallback race from the static schedule", () => {
    expect(buildFallbackNextRace(new Date("2026-03-29T13:22:00.000Z"))).toMatchObject({
      id: "usa-2026",
      round: 4,
      grand_prix_name: "Miami Grand Prix",
      race_starts_at: "2026-05-03T00:00:00.000Z",
    });
  });
});
