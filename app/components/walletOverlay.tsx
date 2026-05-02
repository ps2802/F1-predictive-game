"use client";

import { useRouter } from "next/navigation";
import type React from "react";

export const WALLET_OVERLAY_OPEN_EVENT = "gridlock:wallet-open";

export function requestWalletOverlay(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const event = new CustomEvent(WALLET_OVERLAY_OPEN_EVENT, {
    cancelable: true,
  });

  return !window.dispatchEvent(event);
}

type WalletOverlayButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> & {
  fallbackHref?: string;
};

export function WalletOverlayButton({
  children,
  fallbackHref = "/wallet",
  onClick,
  ...buttonProps
}: WalletOverlayButtonProps) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (!requestWalletOverlay()) {
      router.push(fallbackHref);
    }
  }

  return (
    <button type="button" onClick={handleClick} {...buttonProps}>
      {children}
    </button>
  );
}
