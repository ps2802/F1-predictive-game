import {
  DROP_WORST_N_RACES,
  LOYALTY_STREAK_1_MIN,
  LOYALTY_STREAK_1_MULTIPLIER,
  LOYALTY_STREAK_2_MIN,
  LOYALTY_STREAK_2_MULTIPLIER,
} from "@/lib/gameRules";
import { applyDropWorstN } from "./settleRace";

export type UserRaceScore = {
  race_id: string;
  total_score: number;
  race_date?: string | null; // ISO date, for streak ordering
};

export type SeasonEntry = {
  user_id: string;
  rawTotal: number;
  adjustedTotal: number;
  loyaltyMultiplier: number;
  racesPlayed: number;
  racesDropped: number;
};

/**
 * Compute adjusted season score for a single user.
 * Applies: drop worst N races + loyalty multiplier.
 */
export function computeSeasonScore(
  userId: string,
  scores: UserRaceScore[]
): SeasonEntry {
  const rawScores = scores.map((s) => s.total_score);
  const rawTotal = rawScores.reduce((s, n) => s + n, 0);
  const dropped = Math.min(DROP_WORST_N_RACES, Math.max(0, scores.length - 1));
  const adjustedBase = applyDropWorstN(rawScores, dropped);

  // Loyalty: count consecutive race participations (by ordered race_date)
  const ordered = [...scores].sort((a, b) => {
    if (!a.race_date || !b.race_date) return 0;
    return new Date(a.race_date).getTime() - new Date(b.race_date).getTime();
  });

  let streak = 0;
  for (const s of ordered) {
    if (s.total_score > 0) {
      streak++;
    } else {
      streak = 0; // break on a missed race
    }
  }

  const loyaltyMultiplier =
    streak >= LOYALTY_STREAK_2_MIN
      ? LOYALTY_STREAK_2_MULTIPLIER
      : streak >= LOYALTY_STREAK_1_MIN
      ? LOYALTY_STREAK_1_MULTIPLIER
      : 1.0;

  return {
    user_id: userId,
    rawTotal,
    adjustedTotal: adjustedBase * loyaltyMultiplier,
    loyaltyMultiplier,
    racesPlayed: scores.length,
    racesDropped: dropped,
  };
}
