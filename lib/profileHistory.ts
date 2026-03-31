import {
  selectLatestPredictionVersionRows,
  type PredictionVersionRow,
} from "./predictions";

export type ProfileRaceScore = {
  race_id: string;
  total_score: number;
  calculated_at: string | null;
};

export type ProfilePrediction = {
  id: string;
  race_id: string;
};

export type ProfileRaceHistoryItem = {
  race_id: string;
  total_score: number | null;
  calculated_at: string | null;
  submitted_at: string | null;
  status: "pending" | "scored";
};

function toTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildProfileRaceHistory(params: {
  scores: ProfileRaceScore[];
  predictions: ProfilePrediction[];
  predictionVersions: PredictionVersionRow[];
}): ProfileRaceHistoryItem[] {
  const { scores, predictions, predictionVersions } = params;
  const latestPredictionVersions = selectLatestPredictionVersionRows(predictionVersions);
  const historyByRace = new Map<string, ProfileRaceHistoryItem>();

  for (const score of scores) {
    historyByRace.set(score.race_id, {
      race_id: score.race_id,
      total_score: score.total_score ?? 0,
      calculated_at: score.calculated_at ?? null,
      submitted_at: null,
      status: "scored",
    });
  }

  for (const prediction of predictions) {
    const existing = historyByRace.get(prediction.race_id);
    const submittedAt =
      latestPredictionVersions.get(prediction.id)?.created_at ?? null;

    if (existing) {
      historyByRace.set(prediction.race_id, {
        ...existing,
        submitted_at: existing.submitted_at ?? submittedAt,
      });
      continue;
    }

    historyByRace.set(prediction.race_id, {
      race_id: prediction.race_id,
      total_score: null,
      calculated_at: null,
      submitted_at: submittedAt,
      status: "pending",
    });
  }

  return Array.from(historyByRace.values()).sort((a, b) => {
    const aTimestamp = Math.max(
      toTimestamp(a.calculated_at),
      toTimestamp(a.submitted_at)
    );
    const bTimestamp = Math.max(
      toTimestamp(b.calculated_at),
      toTimestamp(b.submitted_at)
    );

    if (aTimestamp !== bTimestamp) {
      return bTimestamp - aTimestamp;
    }

    return a.race_id.localeCompare(b.race_id);
  });
}
