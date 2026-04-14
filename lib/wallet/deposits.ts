export type NormalizeDepositInput = {
  amount?: number;
  source_amount?: number;
  source_token?: string;
  swapped_amount_usdc?: number;
  credited_amount_usdc?: number;
  fee_amount_usdc?: number;
};

export type NormalizedDeposit = {
  sourceAmount: number;
  sourceToken: string;
  swappedAmountUsdc: number;
  creditedAmountUsdc: number;
  feeAmountUsdc: number;
};

export function normalizeDepositInput(input: NormalizeDepositInput): NormalizedDeposit {
  const feeAmountUsdc = roundUsdc(input.fee_amount_usdc ?? 0);
  if (feeAmountUsdc < 0) {
    throw new Error("fee_amount_usdc cannot be negative.");
  }

  const sourceToken = (input.source_token?.trim() || "USDC").toUpperCase();
  const sourceAmount = roundUsdc(input.source_amount ?? input.amount ?? 0);
  if (sourceAmount <= 0) {
    throw new Error("source_amount is required.");
  }

  const legacyDirectUsdcDeposit =
    input.credited_amount_usdc == null &&
    input.swapped_amount_usdc == null &&
    input.amount != null &&
    sourceToken === "USDC" &&
    feeAmountUsdc === 0;

  const creditedAmountUsdc = roundUsdc(
    input.credited_amount_usdc ??
      (legacyDirectUsdcDeposit ? input.amount ?? 0 : 0)
  );

  if (creditedAmountUsdc <= 0) {
    throw new Error("credited_amount_usdc is required.");
  }

  const swappedAmountUsdc = roundUsdc(
    input.swapped_amount_usdc ?? creditedAmountUsdc + feeAmountUsdc
  );

  if (swappedAmountUsdc <= 0) {
    throw new Error("swapped_amount_usdc must be positive.");
  }

  if (roundUsdc(creditedAmountUsdc + feeAmountUsdc) !== swappedAmountUsdc) {
    throw new Error(
      "swapped_amount_usdc must equal credited_amount_usdc + fee_amount_usdc."
    );
  }

  return {
    sourceAmount,
    sourceToken,
    swappedAmountUsdc,
    creditedAmountUsdc,
    feeAmountUsdc,
  };
}

function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
