import { describe, expect, it } from "vitest";
import {
  findPredictionIdsMissingVersionRows,
  formatMissingPredictionVersionsError,
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
  { id: "opt-a", question_id: "q-podium", option_value: "Driver A" },
  { id: "opt-b", question_id: "q-podium", option_value: "Driver B" },
  { id: "opt-c", question_id: "q-podium", option_value: "Driver C" },
  { id: "opt-d", question_id: "q-podium", option_value: "Driver D" },
  { id: "opt-w", question_id: "q-winner", option_value: "Race Winner" },
  { id: "opt-w2", question_id: "q-winner", option_value: "Driver A" },
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

  it("rejects picking the race winner again for P2 or P3", () => {
    const result = validatePredictionAnswers({
      answers: {
        "q-podium": ["opt-a", "opt-b", "opt-c"],
        "q-winner": ["opt-w2"],
      },
      questions: QUESTIONS,
      options: OPTIONS,
    });

    expect(result).toEqual({
      ok: false,
      error: "Driver A is already picked as race winner. Pick different drivers for P2 and P3.",
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

describe("prediction version coverage", () => {
  it("identifies active predictions that would be silently skipped during settlement", () => {
    const latestRows = selectLatestPredictionVersionRows([
      {
        id: "row-1",
        prediction_id: "pred-1",
        version_number: 2,
        answers_json: { "q-winner": ["opt-b"] },
        created_at: "2026-03-25T11:00:00.000Z",
      },
    ]);

    expect(
      findPredictionIdsMissingVersionRows(["pred-1", "pred-2", "pred-3"], latestRows)
    ).toEqual(["pred-2", "pred-3"]);
  });

  it("formats a clear settlement error when every active prediction is missing a snapshot", () => {
    expect(formatMissingPredictionVersionsError(3, 3)).toContain(
      "none of the 3 active predictions have a frozen snapshot in prediction_versions"
    );
  });
});
