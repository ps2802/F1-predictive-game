"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import {
  resolveSolanaWalletAddress,
  type PrivyUserRecord,
} from "@/lib/privyOnramp";

type OnrampResult = {
  status?: "submitted" | "confirmed";
};

export function PrivyAddMoneyButton({
  children = "Add money",
  className,
  fallbackHref = "/wallet",
  loadingLabel = "Opening...",
  onComplete,
  style,
  walletAddress,
}: {
  children?: React.ReactNode;
  className?: string;
  fallbackHref?: string;
  loadingLabel?: string;
  onComplete?: (result: OnrampResult) => void;
  style?: React.CSSProperties;
  walletAddress?: string | null;
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useFiatOnramp, usePrivy } = require("@privy-io/react-auth") as {
    useFiatOnramp: () => {
      fund: (params: {
        source?: {
          assets?: string[];
          defaultAsset?: string;
        };
        destination: {
          address: string;
          asset: string;
          chain: `${string}:${string}`;
        };
      }) => Promise<OnrampResult>;
    };
    usePrivy: () => {
      authenticated: boolean;
      ready: boolean;
      user: PrivyUserRecord | null;
    };
  };

  const { fund } = useFiatOnramp();
  const { authenticated, ready, user } = usePrivy();
  const router = useRouter();
  const [isFunding, setIsFunding] = useState(false);
  const destinationAddress = useMemo(
    () => resolveSolanaWalletAddress(user, walletAddress),
    [user, walletAddress]
  );

  async function handleAddMoney() {
    if (!ready) {
      router.push(fallbackHref);
      return;
    }

    if (!authenticated) {
      router.push("/login");
      return;
    }

    if (!destinationAddress) {
      router.push(fallbackHref);
      return;
    }

    setIsFunding(true);
    track("add_money_started", { chain: "solana:mainnet", asset: "usdc" });

    try {
      const result = await fund({
        source: {
          assets: ["usd"],
          defaultAsset: "usd",
        },
        destination: {
          address: destinationAddress,
          asset: "usdc",
          chain: "solana:mainnet",
        },
      });
      track("add_money_onramp_completed", {
        chain: "solana:mainnet",
        asset: "usdc",
        status: result.status ?? "unknown",
      });
      onComplete?.(result);
    } catch (error) {
      console.error("[wallet] failed to open Privy onramp:", error);
      track("add_money_onramp_failed", {
        chain: "solana:mainnet",
        asset: "usdc",
      });
      router.push(fallbackHref);
    } finally {
      setIsFunding(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      disabled={isFunding}
      onClick={handleAddMoney}
      style={style}
    >
      {isFunding ? loadingLabel : children}
    </button>
  );
}
