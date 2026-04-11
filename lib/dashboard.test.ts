import { describe, expect, it } from "vitest";
import {
  computeLeagueRankContext,
  getCountdownParts,
  groupDashboardRaces,
  leagueSubline,
  resolveDashboardHeroAction,
  type DashboardLeaguePreviewItem,
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

    // onDeck = 1 hero + up to 3 upcoming = 4 total (per plan spec)
    expect(grouped.onDeck.map((race) => race.id)).toEqual(["b", "c", "d", "e"]);
    expect(grouped.seasonRun.map((race) => race.id)).toEqual([]);
    expect(grouped.settled.map((race) => race.id)).toEqual(["a"]);
  });

  it("overflows to seasonRun when more than 4 open races exist", () => {
    const grouped = groupDashboardRaces([
      makeRace({ id: "a", round: 1, raceStatus: "open", isNext: true }),
      makeRace({ id: "b", round: 2, raceStatus: "open", isNext: false }),
      makeRace({ id: "c", round: 3, raceStatus: "open", isNext: false }),
      makeRace({ id: "d", round: 4, raceStatus: "open", isNext: false }),
      makeRace({ id: "e", round: 5, raceStatus: "open", isNext: false }),
    ]);

    expect(grouped.onDeck.map((race) => race.id)).toEqual(["a", "b", "c", "d"]);
    expect(grouped.seasonRun.map((race) => race.id)).toEqual(["e"]);
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

  it("marks expired when target is in the past", () => {
    const target = "2026-04-01T00:00:00.000Z";
    const now = new Date("2026-04-30T12:00:00.000Z").getTime();
    const result = getCountdownParts(target, now);
    expect(result.expired).toBe(true);
    expect(result.days).toBe("00");
    expect(result.hours).toBe("00");
  });
});

describe("computeLeagueRankContext", () => {
  const scores = new Map([
    ["alice", 30],
    ["bob", 20],
    ["carol", 10],
  ]);

  it("returns nulls for empty member list", () => {
    expect(computeLeagueRankContext("alice", [], scores)).toEqual({
      userRank: null,
      pointsGapToNext: null,
      pointsGapBelow: null,
    });
  });

  it("returns nulls when user is not in the member list", () => {
    expect(computeLeagueRankContext("dave", ["alice", "bob"], scores)).toEqual({
      userRank: null,
      pointsGapToNext: null,
      pointsGapBelow: null,
    });
  });

  it("returns P1 with gap below for leader with a challenger", () => {
    expect(computeLeagueRankContext("alice", ["alice", "bob", "carol"], scores)).toEqual({
      userRank: 1,
      pointsGapToNext: null,
      pointsGapBelow: 10,
    });
  });

  it("returns P1 sole leader with null gap below when only one member", () => {
    expect(computeLeagueRankContext("alice", ["alice"], scores)).toEqual({
      userRank: 1,
      pointsGapToNext: null,
      pointsGapBelow: null,
    });
  });

  it("returns rank and gap to next for mid-table position", () => {
    expect(computeLeagueRankContext("bob", ["alice", "bob", "carol"], scores)).toEqual({
      userRank: 2,
      pointsGapToNext: 10,
      pointsGapBelow: null,
    });
  });

  it("does not populate pointsGapBelow for non-leader even when lower-ranked members exist", () => {
    // carol is P3 behind alice(P1) and bob(P2) — pointsGapBelow is always null for non-P1
    expect(computeLeagueRankContext("carol", ["alice", "bob", "carol"], scores)).toMatchObject({
      userRank: 3,
      pointsGapBelow: null,
    });
  });

  it("tie-breaks by userId lexicographic order — alphabetically earlier uid is ranked higher", () => {
    const tiedScores = new Map([["alpha", 10], ["beta", 10]]);
    // alpha < beta → alpha is P1, beta is P2
    const result = computeLeagueRankContext("beta", ["alpha", "beta"], tiedScores);
    expect(result.userRank).toBe(2);
    expect(result.pointsGapToNext).toBe(0);
  });
});

function makeLeague(overrides: Partial<DashboardLeaguePreviewItem> = {}): DashboardLeaguePreviewItem {
  return {
    id: "league-1",
    name: "Test League",
    memberCount: 5,
    maxUsers: 10,
    prizePool: 100,
    entryFeeUsdc: 10,
    raceId: "bahrain-2026",
    raceName: "Bahrain Grand Prix",
    raceRound: 1,
    userRank: null,
    pointsGapToNext: null,
    pointsGapBelow: null,
    ...overrides,
  };
}

describe("leagueSubline", () => {
  it("shows P1 leading message when user leads with a gap", () => {
    expect(leagueSubline(makeLeague({ userRank: 1, pointsGapBelow: 5 }))).toBe("P1 · Leading by 5 pts");
  });

  it("shows P1 tied when pointsGapBelow is zero", () => {
    // zero gap means tied for P1 — not the same as being the only leader
    expect(leagueSubline(makeLeague({ userRank: 1, pointsGapBelow: 0 }))).toBe("P1 · Tied");
  });

  it("shows P1 sole leader when pointsGapBelow is null", () => {
    expect(leagueSubline(makeLeague({ userRank: 1, pointsGapBelow: null }))).toBe("P1 · Sole leader");
  });

  it("shows rank and gap to next for non-leader with gap data", () => {
    expect(leagueSubline(makeLeague({ userRank: 3, pointsGapToNext: 8 }))).toBe("P3 · 8 pts behind P2");
  });

  it("shows rank only when no gap data available", () => {
    expect(leagueSubline(makeLeague({ userRank: 2, pointsGapToNext: null }))).toBe("P2");
  });

  it("falls back to race name when no rank data", () => {
    expect(leagueSubline(makeLeague({ userRank: null, raceName: "Bahrain Grand Prix", raceRound: 1 }))).toBe(
      "Next: Bahrain Grand Prix · R1"
    );
  });

  it("falls back to member count when no rank and no race", () => {
    expect(leagueSubline(makeLeague({ userRank: null, raceName: null, memberCount: 4, maxUsers: 10 }))).toBe(
      "4/10 members"
    );
  });

  it("rank context takes priority over raceName when both are present", () => {
    // userRank wins — competitive tension shown over upcoming race info
    expect(leagueSubline(makeLeague({ userRank: 1, pointsGapBelow: 5, raceName: "Bahrain Grand Prix" }))).toBe(
      "P1 · Leading by 5 pts"
    );
  });

  it("omits round suffix when raceRound is null", () => {
    expect(leagueSubline(makeLeague({ userRank: null, raceName: "Bahrain Grand Prix", raceRound: null }))).toBe(
      "Next: Bahrain Grand Prix"
    );
  });
});
