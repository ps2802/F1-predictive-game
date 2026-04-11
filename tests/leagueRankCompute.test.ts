import { describe, expect, it } from "vitest";
import { computeLeagueRankContext } from "@/lib/dashboard";

describe("computeLeagueRankContext", () => {
  it("returns all nulls for empty member list", () => {
    expect(computeLeagueRankContext("user-1", [], new Map())).toEqual({
      userRank: null,
      pointsGapToNext: null,
      pointsGapBelow: null,
    });
  });

  it("returns all nulls when user is not in the league", () => {
    const scores = new Map([["other-user", 10]]);
    expect(computeLeagueRankContext("user-1", ["other-user"], scores)).toEqual({
      userRank: null,
      pointsGapToNext: null,
      pointsGapBelow: null,
    });
  });

  it("P1 with no P2 has no gap below", () => {
    const scores = new Map([["user-1", 20]]);
    expect(computeLeagueRankContext("user-1", ["user-1"], scores)).toEqual({
      userRank: 1,
      pointsGapToNext: null,
      pointsGapBelow: null,
    });
  });

  it("P1 computes gap to P2", () => {
    const scores = new Map([["user-1", 20], ["user-2", 12]]);
    const result = computeLeagueRankContext("user-1", ["user-1", "user-2"], scores);
    expect(result).toEqual({ userRank: 1, pointsGapToNext: null, pointsGapBelow: 8 });
  });

  it("P2 computes gap to P1", () => {
    const scores = new Map([["user-1", 20], ["user-2", 12]]);
    const result = computeLeagueRankContext("user-2", ["user-1", "user-2"], scores);
    expect(result).toEqual({ userRank: 2, pointsGapToNext: 8, pointsGapBelow: null });
  });

  it("handles zero-score users — user with no races is last", () => {
    const scores = new Map([["user-1", 15]]);
    const result = computeLeagueRankContext("user-2", ["user-1", "user-2"], scores);
    expect(result.userRank).toBe(2);
    expect(result.pointsGapToNext).toBe(15);
  });

  it("tie-breaks by userId lexicographic order", () => {
    const scores = new Map([["alpha", 10], ["beta", 10]]);
    const result = computeLeagueRankContext("beta", ["alpha", "beta"], scores);
    // alpha < beta lexicographically → alpha is P1, beta is P2
    expect(result.userRank).toBe(2);
    expect(result.pointsGapToNext).toBe(0);
  });
});
