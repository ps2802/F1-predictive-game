import { describe, expect, it } from "vitest";
import {
  resolveSolanaWalletAddress,
  resolveSolanaWalletAddressFromLinkedAccounts,
} from "@/lib/privyOnramp";

describe("resolveSolanaWalletAddress", () => {
  it("uses the server profile wallet address before Privy client state", () => {
    expect(
      resolveSolanaWalletAddress(
        {
          linkedAccounts: [
            {
              address: "privy-linked-sol",
              chainType: "solana",
              walletClientType: "privy-v2",
            },
          ],
        },
        "profile-sol"
      )
    ).toBe("profile-sol");
  });

  it("finds an embedded Solana wallet from linked Privy accounts", () => {
    expect(
      resolveSolanaWalletAddress({
        linkedAccounts: [
          {
            address: "evm-wallet",
            chainType: "ethereum",
            walletClientType: "privy",
          },
          {
            address: "sol-wallet",
            chainType: "solana",
            walletClientType: "privy-v2",
          },
        ],
      })
    ).toBe("sol-wallet");
  });

  it("returns null when only non-Solana wallets are present", () => {
    expect(
      resolveSolanaWalletAddress({
        wallet: {
          address: "evm-wallet",
          chainType: "ethereum",
          walletClientType: "privy",
        },
      })
    ).toBeNull();
  });

  it("accepts privy-v2 Solana wallets when resolving linked accounts", () => {
    expect(
      resolveSolanaWalletAddressFromLinkedAccounts([
        {
          address: "sol-wallet-v2",
          chainType: "solana",
          walletClientType: "privy-v2",
        },
      ])
    ).toBe("sol-wallet-v2");
  });

  it("falls back to any Solana wallet address when embedded metadata is absent", () => {
    expect(
      resolveSolanaWalletAddressFromLinkedAccounts([
        {
          address: "sol-wallet-external",
          chainType: "solana",
        },
      ])
    ).toBe("sol-wallet-external");
  });
});
