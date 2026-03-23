"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // No Privy app ID configured — log clearly so it's visible in dev tools.
    console.error(
      "[Gridlock] NEXT_PUBLIC_PRIVY_APP_ID is not set. " +
      "Auth will not work. Check your .env.local file."
    );
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
      {children}
    </PrivyProvider>
  );
}
