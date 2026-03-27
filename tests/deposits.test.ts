import { describe, expect, it } from "vitest";
import { normalizeDepositInput } from "../lib/wallet/deposits";

describe("normalizeDepositInput", () => {
  it("supports a direct USDC deposit shorthand", () => {
    expect(
      normalizeDepositInput({
        amount: 25,
      })
    ).toEqual({
      sourceAmount: 25,
      sourceToken: "USDC",
      swappedAmountUsdc: 25,
      creditedAmountUsdc: 25,
      feeAmountUsdc: 0,
    });
  });

  it("normalizes a non-USDC deposit that is swapped into USDC with a fee", () => {
    expect(
      normalizeDepositInput({
        source_amount: 2,
        source_token: "sol",
        credited_amount_usdc: 198,
        fee_amount_usdc: 2,
        swapped_amount_usdc: 200,
      })
    ).toEqual({
      sourceAmount: 2,
      sourceToken: "SOL",
      swappedAmountUsdc: 200,
      creditedAmountUsdc: 198,
      feeAmountUsdc: 2,
    });
  });

  it("infers swapped_amount_usdc when credited + fee are provided", () => {
    expect(
      normalizeDepositInput({
        source_amount: 10,
        source_token: "ETH",
        credited_amount_usdc: 99,
        fee_amount_usdc: 1,
      })
    ).toEqual({
      sourceAmount: 10,
      sourceToken: "ETH",
      swappedAmountUsdc: 100,
      creditedAmountUsdc: 99,
      feeAmountUsdc: 1,
    });
  });

  it("rejects inconsistent gross/net amounts", () => {
    expect(() =>
      normalizeDepositInput({
        source_amount: 10,
        source_token: "ETH",
        credited_amount_usdc: 99,
        fee_amount_usdc: 1,
        swapped_amount_usdc: 105,
      })
    ).toThrow("swapped_amount_usdc must equal credited_amount_usdc + fee_amount_usdc.");
  });

  it("rejects deposits with no credited USDC amount for non-legacy deposits", () => {
    expect(() =>
      normalizeDepositInput({
        source_amount: 1,
        source_token: "SOL",
      })
    ).toThrow("credited_amount_usdc is required.");
  });
});
