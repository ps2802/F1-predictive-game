import { describe, expect, it } from "vitest";
import {
  getCountdownParts,
  groupDashboardRaces,
  resolveDashboardHeroAction,
  type DashboardRaceRow,
} from "@/lib/dashboard";

function makeRace(
  overrides: Partial<DashboardRaceRow> = {}
): DashboardRaceRow {
  return {
    id: "miami-2026",
    round: 4,
    name: "Miami Grand Prix",
    country: "United States",
    flag: "\ud83c\uddfa\ud83c\uddf8",
    date: "2026-05-03",
    qualifyingStartsAt: "2026-05-01T18:30:00.000Z",
    raceStartsAt: "2026-05-03T18:00:00.000Z",
    raceStatus: "open",
    predictionStatus: "none",
    isNext: true,
    ...overrides,
  };
}

describe("resolveDashboardHeroAction", () => {
  it("prefers draft-specific hero copy", () => {
    expect(
      resolveDashboardHeroAction(makeRace({ predictionStatus: "draft" }))
    ).toMatchObject({
      label: "Continue Draft",
      tone: "draft",
    });
  });

  it("handles the active sheet state", () => {
    expect(
      resolveDashboardHeroAction(makeRace({ predictionStatus: "active" }))
    ).toMatchObject({
      label: "Edit Prediction",
      tone: "primary",
    });
  });
});

describe("groupDashboardRaces", () => {
  it("splits open races from settled ones", () => {
    const grouped = groupDashboardRaces([
      makeRace({ id: "a", round: 1, raceStatus: "locked", isNext: false }),
      makeRace({ id: "b", round: 2, raceStatus: "open", isNext: true }),
      makeRace({ id: "c", round: 3, raceStatus: "open", isNext: false }),
      makeRace({ id: "d", round: 4, raceStatus: "open", isNext: false }),
      makeRace({ id: "e", round: 5, raceStatus: "open", isNext: false }),
    ]);

    expect(grouped.onDeck.map((race) => race.id)).toEqual(["b", "c", "d"]);
    expect(grouped.seasonRun.map((race) => race.id)).toEqual(["e"]);
    expect(grouped.settled.map((race) => race.id)).toEqual(["a"]);
  });
});

describe("getCountdownParts", () => {
  it("returns stable zero-padded countdown digits", () => {
    const target = "2026-05-01T18:30:00.000Z";
    const now = new Date("2026-04-30T17:28:57.000Z").getTime();

    expect(getCountdownParts(target, now)).toEqual({
      days: "01",
      hours: "01",
      minutes: "01",
      seconds: "03",
      expired: false,
    });
  });
});
