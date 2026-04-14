import { describe, expect, it } from "vitest";
import { leagueSubline, type DashboardLeaguePreviewItem } from "@/lib/dashboard";

const base: DashboardLeaguePreviewItem = {
  id: "league-1",
  name: "Test League",
  userRank: null,
  pointsGapToNext: null,
  pointsGapBelow: null,
  raceName: null,
  raceRound: null,
  raceId: null,
  memberCount: 4,
  maxUsers: 10,
  prizePool: 0,
  entryFeeUsdc: 0,
};

describe("leagueSubline", () => {
  it("P1 leading by gap shows advantage", () => {
    expect(leagueSubline({ ...base, userRank: 1, pointsGapBelow: 5 })).toBe(
      "P1 · Leading by 5 pts"
    );
  });

  it("P1 with zero gap is tied — not sole leader", () => {
    expect(leagueSubline({ ...base, userRank: 1, pointsGapBelow: 0 })).toBe(
      "P1 · Tied"
    );
  });

  it("P1 with no P2 is sole leader", () => {
    expect(leagueSubline({ ...base, userRank: 1, pointsGapBelow: null })).toBe(
      "P1 · Sole leader"
    );
  });

  it("P2+ with gap shows chase distance", () => {
    expect(
      leagueSubline({ ...base, userRank: 3, pointsGapToNext: 12 })
    ).toBe("P3 · 12 pts behind P2");
  });

  it("rank known but no gap data shows rank only", () => {
    expect(leagueSubline({ ...base, userRank: 5, pointsGapToNext: null })).toBe("P5");
  });

  it("no rank falls back to race name", () => {
    expect(
      leagueSubline({ ...base, raceName: "Miami Grand Prix", raceRound: 4 })
    ).toBe("Next: Miami Grand Prix · R4");
  });

  it("no rank, no race falls back to member count", () => {
    expect(leagueSubline(base)).toBe("4/10 members");
  });
});
