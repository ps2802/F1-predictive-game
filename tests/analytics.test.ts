import { describe, expect, it } from "vitest";
import {
  getPageGroup,
  getRaceIdFromPath,
  sanitizeAnalyticsProperties,
} from "../lib/analytics.shared";

describe("analytics helpers", () => {
  it("filters banned and non-primitive analytics properties", () => {
    expect(
      sanitizeAnalyticsProperties({
        amount_usdc: 12,
        email: "user@example.com",
        invite_code: "ABCD1234",
        race_id: "japan-2026",
        wallet_address: "So1anaWallet",
        answers_json: "[...]",
        nested: {} as never,
      })
    ).toEqual({
      amount_usdc: 12,
      race_id: "japan-2026",
    });
  });

  it("derives the expected page groups", () => {
    expect(getPageGroup("/")).toBe("landing");
    expect(getPageGroup("/login")).toBe("auth");
    expect(getPageGroup("/predict/japan-2026")).toBe("prediction");
    expect(getPageGroup("/wallet")).toBe("wallet");
    expect(getPageGroup("/profile")).toBe("profile");
  });

  it("extracts race ids from prediction routes only", () => {
    expect(getRaceIdFromPath("/predict/japan-2026")).toBe("japan-2026");
    expect(getRaceIdFromPath("/dashboard")).toBeNull();
  });
});
