"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import {
  resolveSolanaWalletAddress,
  type PrivyUserRecord,
} from "@/lib/privyOnramp";
import { requestWalletOverlay } from "./walletOverlay";

type OnrampResult = {
  status?: "completed" | "cancelled" | "submitted" | "confirmed";
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
  const { usePrivy } = require("@privy-io/react-auth") as {
    usePrivy: () => {
      authenticated: boolean;
      ready: boolean;
      user: PrivyUserRecord | null;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useFundWallet } = require("@privy-io/react-auth/solana") as {
    useFundWallet: () => {
      fundWallet: (params: {
        address: string;
        options?: {
          chain?: "solana:mainnet" | "solana:devnet" | "solana:testnet";
          asset?: "USDC" | "native-currency";
          amount?: string;
        };
      }) => Promise<OnrampResult>;
    };
  };

  const { fundWallet } = useFundWallet();
  const { authenticated, ready, user } = usePrivy();
  const router = useRouter();
  const [isFunding, setIsFunding] = useState(false);
  const destinationAddress = useMemo(
    () => resolveSolanaWalletAddress(user, walletAddress),
    [user, walletAddress]
  );

  function openFallback() {
    if (!requestWalletOverlay()) {
      router.push(fallbackHref);
    }
  }

  async function handleAddMoney() {
    if (!ready) {
      openFallback();
      return;
    }

    if (!authenticated) {
      router.push("/login");
      return;
    }

    if (!destinationAddress) {
      openFallback();
      return;
    }

    setIsFunding(true);
    track("add_money_started", { chain: "solana:mainnet", asset: "usdc" });

    try {
      const result = await fundWallet({
        address: destinationAddress,
        options: {
          chain: "solana:mainnet",
          asset: "USDC",
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
      openFallback();
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
