import { describe, expect, it } from "vitest";
import { buildProfileRaceHistory } from "../lib/profileHistory";

describe("buildProfileRaceHistory", () => {
  it("includes pending predictions that do not have race scores yet", () => {
    const history = buildProfileRaceHistory({
      scores: [],
      predictions: [{ id: "pred-1", race_id: "japan-2026" }],
      predictionVersions: [
        {
          id: "ver-1",
          prediction_id: "pred-1",
          version_number: 1,
          answers_json: {},
          created_at: "2026-03-28T06:00:00.000Z",
        },
      ],
    });

    expect(history).toEqual([
      {
        race_id: "japan-2026",
        total_score: null,
        calculated_at: null,
        submitted_at: "2026-03-28T06:00:00.000Z",
        status: "pending",
      },
    ]);
  });

  it("preserves scored races and enriches them with latest submission time", () => {
    const history = buildProfileRaceHistory({
      scores: [
        {
          race_id: "australia-2026",
          total_score: 42.5,
          calculated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      predictions: [{ id: "pred-1", race_id: "australia-2026" }],
      predictionVersions: [
        {
          id: "ver-1",
          prediction_id: "pred-1",
          version_number: 1,
          answers_json: {},
          created_at: "2026-03-08T04:00:00.000Z",
        },
      ],
    });

    expect(history).toEqual([
      {
        race_id: "australia-2026",
        total_score: 42.5,
        calculated_at: "2026-03-09T08:00:00.000Z",
        submitted_at: "2026-03-08T04:00:00.000Z",
        status: "scored",
      },
    ]);
  });

  it("sorts newest activity first across pending and scored races", () => {
    const history = buildProfileRaceHistory({
      scores: [
        {
          race_id: "australia-2026",
          total_score: 12,
          calculated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      predictions: [
        { id: "pred-1", race_id: "japan-2026" },
        { id: "pred-2", race_id: "miami-2026" },
      ],
      predictionVersions: [
        {
          id: "ver-1",
          prediction_id: "pred-1",
          version_number: 1,
          answers_json: {},
          created_at: "2026-03-28T06:00:00.000Z",
        },
        {
          id: "ver-2",
          prediction_id: "pred-2",
          version_number: 1,
          answers_json: {},
          created_at: "2026-03-10T06:00:00.000Z",
        },
      ],
    });

    expect(history.map((entry) => entry.race_id)).toEqual([
      "japan-2026",
      "miami-2026",
      "australia-2026",
    ]);
  });
});
