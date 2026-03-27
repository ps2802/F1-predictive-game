import { describe, expect, it } from "vitest";
import {
  calculateRake,
  distributePool,
  rankUsers,
  DEFAULT_PAYOUT_TIERS,
  DEFAULT_PAYOUT_MODEL,
} from "../lib/scoring/distributePrizes";

describe("calculateRake", () => {
  it("deducts 10% rake from entry fee", () => {
    const { rake, netToPool } = calculateRake(100);
    expect(rake).toBe(10);
    expect(netToPool).toBe(90);
  });

  it("preserves the full fee after rounding", () => {
    for (const fee of [0, 1, 5, 10, 99.99, 250, 1000]) {
      const { rake, netToPool } = calculateRake(fee);
      expect(rake + netToPool).toBeCloseTo(fee, 5);
    }
  });
});

describe("rankUsers", () => {
  it("defaults to score ordering when no tie-break metrics are supplied", () => {
    const ranked = rankUsers([
      { userId: "a", score: 100 },
      { userId: "b", score: 200 },
      { userId: "c", score: 150 },
    ]);

    expect(ranked.map((user) => [user.userId, user.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("uses difficulty, correct picks, then submission timestamp as deterministic tie-breakers", () => {
    const ranked = rankUsers([
      {
        userId: "late",
        score: 100,
        difficultyScore: 40,
        correctPicks: 4,
        submittedAt: "2026-03-27T12:10:00.000Z",
      },
      {
        userId: "early",
        score: 100,
        difficultyScore: 40,
        correctPicks: 4,
        submittedAt: "2026-03-27T12:00:00.000Z",
      },
      {
        userId: "more-correct",
        score: 100,
        difficultyScore: 40,
        correctPicks: 5,
        submittedAt: "2026-03-27T12:30:00.000Z",
      },
      {
        userId: "higher-diff",
        score: 100,
        difficultyScore: 45,
        correctPicks: 1,
        submittedAt: "2026-03-27T12:30:00.000Z",
      },
    ]);

    expect(ranked.map((user) => user.userId)).toEqual([
      "higher-diff",
      "more-correct",
      "early",
      "late",
    ]);
    expect(ranked.every((user, index) => user.rank === index + 1)).toBe(true);
  });

  it("only produces a shared rank when every tie-break field is still equal", () => {
    const ranked = rankUsers([
      {
        userId: "a",
        score: 100,
        difficultyScore: 20,
        correctPicks: 3,
        submittedAt: "2026-03-27T12:00:00.000Z",
      },
      {
        userId: "b",
        score: 100,
        difficultyScore: 20,
        correctPicks: 3,
        submittedAt: "2026-03-27T12:00:00.000Z",
      },
      {
        userId: "c",
        score: 90,
      },
    ]);

    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });
});

describe("distributePool", () => {
  const rankedThreeUsers = rankUsers([
    { userId: "a", score: 300 },
    { userId: "b", score: 200 },
    { userId: "c", score: 100 },
  ]);

  it("defaults to manual 50/30/20 payouts", () => {
    const result = distributePool("league-1", 1000, rankedThreeUsers);

    expect(DEFAULT_PAYOUT_MODEL).toBe("manual");
    expect(DEFAULT_PAYOUT_TIERS).toEqual([
      { place: 1, percent: 50 },
      { place: 2, percent: 30 },
      { place: 3, percent: 20 },
    ]);
    expect(result.model).toBe("manual");
    expect(result.payouts).toEqual([
      { userId: "a", rank: 1, amount: 500, held: false },
      { userId: "b", rank: 2, amount: 300, held: false },
      { userId: "c", rank: 3, amount: 200, held: false },
    ]);
    expect(result.withheldAmount).toBe(0);
    expect(result.undistributed).toBe(0);
  });

  it("allows manual tiers to sum below 100 and leaves the remainder undistributed", () => {
    const result = distributePool(
      "league-1",
      1000,
      rankedThreeUsers,
      { tiers: [{ place: 1, percent: 60 }, { place: 2, percent: 20 }] },
      "manual"
    );

    expect(result.payouts).toEqual([
      { userId: "a", rank: 1, amount: 600, held: false },
      { userId: "b", rank: 2, amount: 200, held: false },
    ]);
    expect(result.undistributed).toBe(200);
  });

  it("splits tied manual tiers across the tied group", () => {
    const ranked = rankUsers([
      {
        userId: "a",
        score: 200,
        difficultyScore: 20,
        correctPicks: 3,
        submittedAt: "2026-03-27T12:00:00.000Z",
      },
      {
        userId: "b",
        score: 200,
        difficultyScore: 20,
        correctPicks: 3,
        submittedAt: "2026-03-27T12:00:00.000Z",
      },
      { userId: "c", score: 100 },
    ]);

    const result = distributePool("league-1", 1000, ranked, undefined, "manual");

    expect(result.payouts).toEqual([
      { userId: "a", rank: 1, amount: 400, held: false },
      { userId: "b", rank: 1, amount: 400, held: false },
      { userId: "c", rank: 3, amount: 200, held: false },
    ]);
  });

  it("compresses payout ranks when late joiners are payout-ineligible", () => {
    const ranked = rankUsers([
      { userId: "late", score: 300, payoutEligible: false },
      { userId: "winner", score: 200 },
      { userId: "runner-up", score: 100 },
    ]);

    const result = distributePool("league-1", 1000, ranked, undefined, "manual");

    expect(result.payouts).toEqual([
      { userId: "winner", rank: 1, amount: 500, held: false },
      { userId: "runner-up", rank: 2, amount: 300, held: false },
    ]);
    expect(result.undistributed).toBe(200);
  });

  it("holds but does not reallocate frozen payouts", () => {
    const ranked = rankUsers([
      { userId: "held", score: 300, payoutFrozen: true },
      { userId: "winner", score: 200 },
      { userId: "runner-up", score: 100 },
    ]);

    const result = distributePool("league-1", 1000, ranked, undefined, "manual");

    expect(result.payouts).toEqual([
      { userId: "held", rank: 1, amount: 500, held: true },
      { userId: "winner", rank: 2, amount: 300, held: false },
      { userId: "runner-up", rank: 3, amount: 200, held: false },
    ]);
    expect(result.withheldAmount).toBe(500);
    expect(result.undistributed).toBe(0);
  });

  it("supports top-half-only payouts", () => {
    const ranked = rankUsers([
      { userId: "a", score: 500 },
      { userId: "b", score: 400 },
      { userId: "c", score: 300 },
      { userId: "d", score: 200 },
      { userId: "e", score: 100 },
      { userId: "f", score: 50 },
    ]);

    const result = distributePool(
      "league-1",
      1000,
      ranked,
      { tiers: DEFAULT_PAYOUT_TIERS, top_half_only: true },
      "manual"
    );

    expect(result.payouts.map((payout) => payout.userId)).toEqual(["a", "b", "c"]);
    expect(result.undistributed).toBe(0);
  });

  it("supports skill-weighted payouts and excludes zero scorers", () => {
    const ranked = rankUsers([
      { userId: "a", score: 50 },
      { userId: "b", score: 30 },
      { userId: "c", score: 20 },
      { userId: "d", score: 0 },
    ]);

    const result = distributePool("league-1", 1000, ranked, null, "skill_weighted");

    expect(result.model).toBe("skill_weighted");
    expect(result.payouts).toEqual([
      { userId: "a", rank: 1, amount: 500, held: false },
      { userId: "b", rank: 2, amount: 300, held: false },
      { userId: "c", rank: 3, amount: 200, held: false },
    ]);
    expect(result.payouts.find((payout) => payout.userId === "d")).toBeUndefined();
  });
});
