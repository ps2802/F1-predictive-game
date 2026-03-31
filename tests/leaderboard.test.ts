import { describe, expect, it } from "vitest";
import { buildLeaderboard } from "../lib/leaderboard";

describe("buildLeaderboard", () => {
  it("counts distinct predicted races per user", () => {
    const entries = buildLeaderboard({
      profiles: [{ id: "u1", username: "Money420", avatar_url: null }],
      scores: [],
      predictions: [
        { user_id: "u1", race_id: "japan-2026" },
        { user_id: "u1", race_id: "japan-2026" },
        { user_id: "u1", race_id: "miami-2026" },
      ],
    });

    expect(entries[0]).toMatchObject({
      user_id: "u1",
      total_score: 0,
      races_played: 2,
    });
  });

  it("sums scores and sorts by score, then races played", () => {
    const entries = buildLeaderboard({
      profiles: [
        { id: "u1", username: "Money420", avatar_url: null },
        { id: "u2", username: "ps2802", avatar_url: null },
      ],
      scores: [
        { user_id: "u1", total_score: 12.5 },
        { user_id: "u1", total_score: 7.5 },
        { user_id: "u2", total_score: 20 },
      ],
      predictions: [
        { user_id: "u1", race_id: "japan-2026" },
        { user_id: "u1", race_id: "miami-2026" },
        { user_id: "u2", race_id: "japan-2026" },
      ],
    });

    expect(entries).toEqual([
      {
        user_id: "u1",
        username: "Money420",
        avatar_url: null,
        total_score: 20,
        races_played: 2,
      },
      {
        user_id: "u2",
        username: "ps2802",
        avatar_url: null,
        total_score: 20,
        races_played: 1,
      },
    ]);
  });
});
