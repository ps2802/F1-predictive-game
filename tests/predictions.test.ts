import { describe, expect, it } from "vitest";
import {
  selectLatestPredictionVersionRows,
  selectLatestPredictionVersions,
  validatePredictionAnswers,
  type PredictionOptionDefinition,
  type PredictionQuestionDefinition,
} from "../lib/predictions";

const QUESTIONS: PredictionQuestionDefinition[] = [
  { id: "q-podium", question_type: "podium", multi_select: 3 },
  { id: "q-winner", question_type: "winner", multi_select: 1 },
];

const OPTIONS: PredictionOptionDefinition[] = [
  { id: "opt-a", question_id: "q-podium" },
  { id: "opt-b", question_id: "q-podium" },
  { id: "opt-c", question_id: "q-podium" },
  { id: "opt-d", question_id: "q-podium" },
  { id: "opt-w", question_id: "q-winner" },
];

describe("validatePredictionAnswers", () => {
  it("accepts exactly the required picks and returns ordered answer rows", () => {
    const result = validatePredictionAnswers({
      answers: {
        "q-podium": ["opt-a", "opt-b", "opt-c"],
        "q-winner": ["opt-w"],
      },
      questions: QUESTIONS,
      options: OPTIONS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.answerRows).toEqual([
      { question_id: "q-podium", option_id: "opt-a", pick_order: 1 },
      { question_id: "q-podium", option_id: "opt-b", pick_order: 2 },
      { question_id: "q-podium", option_id: "opt-c", pick_order: 3 },
      { question_id: "q-winner", option_id: "opt-w", pick_order: 1 },
    ]);
  });

  it("rejects duplicate picks for the same question", () => {
    const result = validatePredictionAnswers({
      answers: {
        "q-podium": ["opt-a", "opt-a", "opt-c"],
        "q-winner": ["opt-w"],
      },
      questions: QUESTIONS,
      options: OPTIONS,
    });

    expect(result).toEqual({
      ok: false,
      error: "Duplicate picks are not allowed for podium.",
    });
  });

  it("rejects too many picks", () => {
    const result = validatePredictionAnswers({
      answers: {
        "q-podium": ["opt-a", "opt-b", "opt-c", "opt-d"],
        "q-winner": ["opt-w"],
      },
      questions: QUESTIONS,
      options: OPTIONS,
    });

    expect(result).toEqual({
      ok: false,
      error: "Too many picks submitted for podium.",
    });
  });

  it("rejects options that do not belong to the question", () => {
    const result = validatePredictionAnswers({
      answers: {
        "q-podium": ["opt-a", "opt-b", "opt-w"],
        "q-winner": ["opt-w"],
      },
      questions: QUESTIONS,
      options: OPTIONS,
    });

    expect(result).toEqual({
      ok: false,
      error: "Invalid option submitted for podium.",
    });
  });
});

describe("selectLatestPredictionVersions", () => {
  it("picks the highest version number per prediction", () => {
    const latest = selectLatestPredictionVersions([
      {
        prediction_id: "pred-1",
        version_number: 1,
        answers_json: { "q-winner": ["opt-a"] },
        created_at: "2026-03-25T10:00:00.000Z",
      },
      {
        prediction_id: "pred-1",
        version_number: 2,
        answers_json: { "q-winner": ["opt-b"] },
        created_at: "2026-03-25T11:00:00.000Z",
      },
    ]);

    expect(latest.get("pred-1")).toEqual({ "q-winner": ["opt-b"] });
  });

  it("breaks version ties by created_at", () => {
    const latest = selectLatestPredictionVersions([
      {
        id: "a",
        prediction_id: "pred-1",
        version_number: 1,
        answers_json: { "q-winner": ["opt-a"] },
        created_at: "2026-03-25T10:00:00.000Z",
      },
      {
        id: "b",
        prediction_id: "pred-1",
        version_number: 1,
        answers_json: { "q-winner": ["opt-b"] },
        created_at: "2026-03-25T11:00:00.000Z",
      },
    ]);

    expect(latest.get("pred-1")).toEqual({ "q-winner": ["opt-b"] });
  });

  it("returns the full winning row when submission metadata is needed", () => {
    const latestRows = selectLatestPredictionVersionRows([
      {
        id: "a",
        prediction_id: "pred-1",
        version_number: 1,
        answers_json: { "q-winner": ["opt-a"] },
        created_at: "2026-03-25T10:00:00.000Z",
      },
      {
        id: "b",
        prediction_id: "pred-1",
        version_number: 2,
        answers_json: { "q-winner": ["opt-b"] },
        created_at: "2026-03-25T11:00:00.000Z",
      },
    ]);

    expect(latestRows.get("pred-1")).toEqual({
      id: "b",
      prediction_id: "pred-1",
      version_number: 2,
      answers_json: { "q-winner": ["opt-b"] },
      created_at: "2026-03-25T11:00:00.000Z",
    });
  });
});
