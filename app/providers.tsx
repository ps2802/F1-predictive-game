"use client";

import { PrivyProvider } from "@privy-io/react-auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // No Privy app ID configured — render children without provider.
    // Auth pages will show a clear error message in this state.
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "apple"],
        embeddedWallets: {
          solana: { createOnLogin: "all-users" },
        },
        appearance: {
          theme: "dark",
          accentColor: "#E8002D",
          logo: "/gridlock logo - transparent.png",
          landingHeader: "Gridlock",
          loginMessage: "Predict the grid. Outsmart the crowd.",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
