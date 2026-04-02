import { describe, expect, it } from "vitest";
import {
  buildPastRacesList,
  buildPredictionComparisons,
  parseBreakdown,
} from "../lib/pastRaces";

describe("parseBreakdown", () => {
  it("normalizes the structured breakdown shape", () => {
    const breakdown = parseBreakdown({
      questions: [
        {
          question_id: "q-win",
          question_type: "winner",
          category: "race",
          raw_score: 24.5,
          base_points: 20,
          difficulty_multiplier: 1.225,
          confidence_multiplier: 1,
          is_correct: true,
          label: "Race Winner",
        },
      ],
      chaos_bonus: 5,
      correct_picks: 3,
      submitted_at: "2026-03-28T06:00:00.000Z",
    });

    expect(breakdown).toEqual({
      questions: [
        {
          question_id: "q-win",
          question_type: "winner",
          category: "race",
          raw_score: 24.5,
          base_points: 20,
          difficulty_multiplier: 1.225,
          confidence_multiplier: 1,
          is_correct: true,
          label: "Race Winner",
        },
      ],
      chaos_bonus: 5,
      correct_picks: 3,
      submitted_at: "2026-03-28T06:00:00.000Z",
    });
  });
});

describe("buildPredictionComparisons", () => {
  it("marks exact, partial, wrong, and unanswered outcomes", () => {
    const comparisons = buildPredictionComparisons({
      questions: [
        {
          id: "q-win",
          race_id: "r1",
          category: "race",
          question_type: "winner",
          label: "Race Winner",
          display_order: 1,
          options: [
            { id: "verstappen", option_value: "Max Verstappen" },
            { id: "norris", option_value: "Lando Norris" },
          ],
        },
        {
          id: "q-podium",
          race_id: "r1",
          category: "race",
          question_type: "podium",
          label: "Podium",
          display_order: 2,
          options: [
            { id: "norris", option_value: "Lando Norris" },
            { id: "leclerc", option_value: "Charles Leclerc" },
            { id: "piastri", option_value: "Oscar Piastri" },
            { id: "russell", option_value: "George Russell" },
          ],
        },
        {
          id: "q-fastest",
          race_id: "r1",
          category: "race",
          question_type: "fastest_lap",
          label: "Fastest Lap",
          display_order: 3,
          options: [
            { id: "norris", option_value: "Lando Norris" },
            { id: "leclerc", option_value: "Charles Leclerc" },
          ],
        },
        {
          id: "q-chaos",
          race_id: "r1",
          category: "chaos",
          question_type: "safety_car",
          label: "Safety Car",
          display_order: 4,
          options: [
            { id: "yes", option_value: "Yes" },
            { id: "no", option_value: "No" },
          ],
        },
      ],
      answers: {
        "q-win": ["verstappen"],
        "q-podium": ["norris", "leclerc", "russell"],
        "q-fastest": ["leclerc"],
      },
      results: [
        { race_id: "r1", question_id: "q-win", correct_option_id: "verstappen", pick_order: 1 },
        { race_id: "r1", question_id: "q-podium", correct_option_id: "norris", pick_order: 1 },
        { race_id: "r1", question_id: "q-podium", correct_option_id: "leclerc", pick_order: 2 },
        { race_id: "r1", question_id: "q-podium", correct_option_id: "piastri", pick_order: 3 },
        { race_id: "r1", question_id: "q-fastest", correct_option_id: "norris", pick_order: 1 },
        { race_id: "r1", question_id: "q-chaos", correct_option_id: "yes", pick_order: 1 },
      ],
      breakdownQuestions: [
        {
          question_id: "q-win",
          question_type: "winner",
          category: "race",
          base_points: 20,
          difficulty_multiplier: 1,
          confidence_multiplier: 1,
          raw_score: 20,
          is_correct: true,
          label: "Race Winner",
        },
        {
          question_id: "q-podium",
          question_type: "podium",
          category: "race",
          base_points: 15,
          difficulty_multiplier: 1,
          confidence_multiplier: 1,
          raw_score: 8,
          is_correct: true,
          label: "Podium",
        },
        {
          question_id: "q-fastest",
          question_type: "fastest_lap",
          category: "race",
          base_points: 12,
          difficulty_multiplier: 1,
          confidence_multiplier: 1,
          raw_score: 0,
          is_correct: false,
          label: "Fastest Lap",
        },
        {
          question_id: "q-chaos",
          question_type: "safety_car",
          category: "chaos",
          base_points: 8,
          difficulty_multiplier: 1,
          confidence_multiplier: 1,
          raw_score: 0,
          is_correct: false,
          label: "Safety Car",
        },
      ],
    });

    expect(comparisons.map((comparison) => comparison.status)).toEqual([
      "correct",
      "partial",
      "wrong",
      "unanswered",
    ]);
    expect(comparisons[1]?.points_earned).toBe(8);
    expect(comparisons[1]?.actual_result).toBe("Lando Norris, Charles Leclerc, Oscar Piastri");
  });

  it("treats set-based questions as exact even when the user pick order differs", () => {
    const comparisons = buildPredictionComparisons({
      questions: [
        {
          id: "q-teams",
          race_id: "r1",
          category: "qualifying",
          question_type: "teams_q3",
          label: "Teams in Q3",
          display_order: 1,
          options: [
            { id: "mclaren", option_value: "McLaren" },
            { id: "ferrari", option_value: "Ferrari" },
            { id: "mercedes", option_value: "Mercedes" },
          ],
        },
      ],
      answers: {
        "q-teams": ["ferrari", "mclaren", "mercedes"],
      },
      results: [
        { race_id: "r1", question_id: "q-teams", correct_option_id: "mclaren", pick_order: 1 },
        { race_id: "r1", question_id: "q-teams", correct_option_id: "ferrari", pick_order: 2 },
        { race_id: "r1", question_id: "q-teams", correct_option_id: "mercedes", pick_order: 3 },
      ],
      breakdownQuestions: [
        {
          question_id: "q-teams",
          question_type: "teams_q3",
          category: "qualifying",
          base_points: 15,
          difficulty_multiplier: 1,
          confidence_multiplier: 1,
          raw_score: 15,
          is_correct: true,
          label: "Teams in Q3",
        },
      ],
    });

    expect(comparisons[0]?.status).toBe("correct");
  });

  it("treats seeded both_cars_q3 and p5_to_p10 question types as set-based", () => {
    const comparisons = buildPredictionComparisons({
      questions: [
        {
          id: "q-q3",
          race_id: "r1",
          category: "qualifying",
          question_type: "both_cars_q3",
          label: "Both Cars in Q3",
          display_order: 1,
          options: [
            { id: "mclaren", option_value: "McLaren" },
            { id: "ferrari", option_value: "Ferrari" },
          ],
        },
        {
          id: "q-points",
          race_id: "r1",
          category: "chaos",
          question_type: "p5_to_p10",
          label: "P5-P10",
          display_order: 2,
          options: [
            { id: "norris", option_value: "Lando Norris" },
            { id: "piastri", option_value: "Oscar Piastri" },
          ],
        },
      ],
      answers: {
        "q-q3": ["ferrari", "mclaren"],
        "q-points": ["piastri", "norris"],
      },
      results: [
        { race_id: "r1", question_id: "q-q3", correct_option_id: "mclaren", pick_order: 1 },
        { race_id: "r1", question_id: "q-q3", correct_option_id: "ferrari", pick_order: 2 },
        { race_id: "r1", question_id: "q-points", correct_option_id: "norris", pick_order: 1 },
        { race_id: "r1", question_id: "q-points", correct_option_id: "piastri", pick_order: 2 },
      ],
      breakdownQuestions: [
        {
          question_id: "q-q3",
          question_type: "both_cars_q3",
          category: "qualifying",
          base_points: 10,
          difficulty_multiplier: 1,
          confidence_multiplier: 1,
          raw_score: 10,
          is_correct: true,
          label: "Both Cars in Q3",
        },
        {
          question_id: "q-points",
          question_type: "p5_to_p10",
          category: "chaos",
          base_points: 10,
          difficulty_multiplier: 1,
          confidence_multiplier: 1,
          raw_score: 10,
          is_correct: true,
          label: "P5-P10",
        },
      ],
    });

    expect(comparisons.map((comparison) => comparison.status)).toEqual([
      "correct",
      "correct",
    ]);
  });
});

describe("buildPastRacesList", () => {
  it("uses the latest prediction version when assembling race reviews", () => {
    const pastRaces = buildPastRacesList({
      races: [
        {
          id: "australia-2026",
          round: 1,
          name: "Australian Grand Prix",
          country: "Australia",
          race_date: "2026-03-08",
          race_starts_at: "2026-03-08T04:00:00.000Z",
        },
      ],
      scores: [
        {
          race_id: "australia-2026",
          total_score: 24.5,
          edit_penalty: 1,
          breakdown_json: {
            questions: [
              {
                question_id: "q-win",
                question_type: "winner",
                category: "race",
                raw_score: 24.5,
                base_points: 20,
                difficulty_multiplier: 1.225,
                confidence_multiplier: 1,
                is_correct: true,
                label: "Race Winner",
              },
            ],
            submitted_at: "2026-03-08T02:00:00.000Z",
            chaos_bonus: 0,
          },
          calculated_at: "2026-03-08T06:00:00.000Z",
        },
      ],
      predictions: [{ id: "pred-1", race_id: "australia-2026" }],
      predictionVersions: [
        {
          id: "ver-1",
          prediction_id: "pred-1",
          version_number: 1,
          answers_json: { "q-win": ["norris"] },
          created_at: "2026-03-08T01:00:00.000Z",
        },
        {
          id: "ver-2",
          prediction_id: "pred-1",
          version_number: 2,
          answers_json: { "q-win": ["verstappen"] },
          created_at: "2026-03-08T02:00:00.000Z",
        },
      ],
      questions: [
        {
          id: "q-win",
          race_id: "australia-2026",
          category: "race",
          question_type: "winner",
          label: "Race Winner",
          display_order: 1,
          options: [
            { id: "verstappen", option_value: "Max Verstappen" },
            { id: "norris", option_value: "Lando Norris" },
          ],
        },
      ],
      results: [
        {
          race_id: "australia-2026",
          question_id: "q-win",
          correct_option_id: "verstappen",
          pick_order: 1,
        },
      ],
    });

    expect(pastRaces).toHaveLength(1);
    expect(pastRaces[0]?.submitted_at).toBe("2026-03-08T02:00:00.000Z");
    expect(pastRaces[0]?.comparisons[0]?.user_pick).toBe("Max Verstappen");
    expect(pastRaces[0]?.comparisons[0]?.status).toBe("correct");
  });
});
