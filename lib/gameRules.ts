export const PLATFORM_RAKE_PERCENT = 0.1;
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
