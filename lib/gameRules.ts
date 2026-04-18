export const PLATFORM_RAKE_PERCENT = 0.1;

/** Solana wallet address that receives all platform fee withdrawals. */
export const PLATFORM_FEE_WALLET_ADDRESS = "AM2GUxA79YU2MwfhhHaFJsi5ch8cxq5PQXq8XbPZb71z";
export const MINIMUM_LEAGUE_STAKE_USDC = 5;
export const PRE_LOCK_BUFFER_MINUTES = 10;
export const PAID_EDIT_WINDOW_MINUTES = 10;
export const PREDICTION_EDIT_FEE_USDC = 1;

export type PayoutChoice = "fair" | "custom";

export function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function calculateStakeSplit(stakeAmountUsdc: number): {
  rake: number;
  netToPool: number;
} {
  const rake = roundUsdc(stakeAmountUsdc * PLATFORM_RAKE_PERCENT);
  return {
    rake,
    netToPool: roundUsdc(stakeAmountUsdc - rake),
  };
}

export function toPayoutModel(choice: PayoutChoice): "skill_weighted" | "manual" {
  return choice === "fair" ? "skill_weighted" : "manual";
}

export const DROP_WORST_N_RACES = 2;
export const LOYALTY_STREAK_1_MIN = 10;
export const LOYALTY_STREAK_1_MULTIPLIER = 1.05;
export const LOYALTY_STREAK_2_MIN = 20;
export const LOYALTY_STREAK_2_MULTIPLIER = 1.1;
export const MINIMUM_LEAGUE_SIZE_FOR_PAYOUT = 5;
