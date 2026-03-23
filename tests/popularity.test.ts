/**
 * Popularity snapshot computation tests
 * Covers: computePopularitySnapshots (pure function, no DB required)
 */
import { describe, it, expect } from "vitest";
import {
  computePopularitySnapshots,
  type RawPickCount,
} from "../lib/scoring/settleRace";

describe("computePopularitySnapshots", () => {
  it("returns empty array when totalActiveEntries is 0", () => {
    const counts: RawPickCount[] = [
      { question_id: "q1", option_id: "opt-ver", pick_count: 5 },
    ];
    expect(computePopularitySnapshots(counts, 0)).toEqual([]);
  });

  it("calculates popularity_percent as pick_count / totalActiveEntries", () => {
    const counts: RawPickCount[] = [
      { question_id: "q1", option_id: "opt-ver", pick_count: 40 },
      { question_id: "q1", option_id: "opt-nor", pick_count: 60 },
    ];
    const snaps = computePopularitySnapshots(counts, 100);
    const ver = snaps.find((s) => s.option_id === "opt-ver")!;
    const nor = snaps.find((s) => s.option_id === "opt-nor")!;
    expect(ver.popularity_percent).toBeCloseTo(0.4, 5);
    expect(nor.popularity_percent).toBeCloseTo(0.6, 5);
  });

  it("preserves question_id and option_id passthrough", () => {
    const counts: RawPickCount[] = [
      { question_id: "q-pole", option_id: "opt-lec", pick_count: 10 },
    ];
    const snaps = computePopularitySnapshots(counts, 20);
    expect(snaps[0].question_id).toBe("q-pole");
    expect(snaps[0].option_id).toBe("opt-lec");
  });

  it("allows popularity > 1 (unnormalised input — caller's responsibility)", () => {
    // If caller passes totalActiveEntries smaller than actual picks, we don't clamp
    const counts: RawPickCount[] = [
      { question_id: "q1", option_id: "opt-ver", pick_count: 30 },
    ];
    const snaps = computePopularitySnapshots(counts, 20);
    // 30/20 = 1.5 — function does not clamp, caller must pass correct total
    expect(snaps[0].popularity_percent).toBeCloseTo(1.5, 5);
  });

  it("handles multiple questions in same batch", () => {
    const counts: RawPickCount[] = [
      { question_id: "q1", option_id: "opt-a", pick_count: 10 },
      { question_id: "q2", option_id: "opt-b", pick_count: 5 },
    ];
    const snaps = computePopularitySnapshots(counts, 20);
    expect(snaps).toHaveLength(2);
    expect(snaps.find((s) => s.question_id === "q1")?.popularity_percent).toBeCloseTo(0.5, 5);
    expect(snaps.find((s) => s.question_id === "q2")?.popularity_percent).toBeCloseTo(0.25, 5);
  });
});
