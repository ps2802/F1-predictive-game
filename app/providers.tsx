"use client";

import { useEffect } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import posthog from "posthog-js";

function PostHogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
    if (!key) return;
    posthog.init(key, {
      api_host: host,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false, // manual events only — keeps data clean for beta
      persistence: "localStorage",
    });
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // No Privy app ID configured — auth will not work. Check .env.local.
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        // loginMethods is intentionally omitted — Privy will show whatever
        // methods are enabled in the dashboard. Passing methods that are NOT
        // enabled in the dashboard causes Privy to throw internally and the
        // modal never renders (silent failure).
        appearance: {
          theme: "dark",
          accentColor: "#E8002D",
          logo: "/gridlock logo - transparent.png",
          landingHeader: "Gridlock",
          loginMessage: "Predict the grid. Outsmart the crowd.",
        },
        embeddedWallets: {
          solana: { createOnLogin: "all-users" },
        },
      }}
    >
      <PostHogInit />
      {children}
    </PrivyProvider>
  );
}
