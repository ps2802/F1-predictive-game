/**
 * lib/gameRules.ts — non-monetary game rules and scoring tuning.
 *
 * Gridlock is a free Web2 game: there are no stakes, fees, rakes, or payouts.
 * Only prediction-lock timing and season-scoring constants live here.
 */

/** Minutes before the first competitive session of a weekend that picks lock. */
export const PRE_LOCK_BUFFER_MINUTES = 10;

// Season-scoring tuning (drop-worst + loyalty streak multipliers).
export const DROP_WORST_N_RACES = 2;
export const LOYALTY_STREAK_1_MIN = 10;
export const LOYALTY_STREAK_1_MULTIPLIER = 1.05;
export const LOYALTY_STREAK_2_MIN = 20;
export const LOYALTY_STREAK_2_MULTIPLIER = 1.1;
