"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PrivyProvider } from "@privy-io/react-auth";
import {
  captureInitialAcquisitionContext,
  getPageGroup,
  getRaceIdFromPath,
  initClarityClient,
  initPostHogClient,
  setClarityTag,
} from "@/lib/analytics";
import {
  getPrivyAppId,
  getPrivyClientId,
  isPrivyEmailOnlyEnvironment,
  shouldEnablePrivyEmbeddedWallets,
} from "@/lib/privy";

function AnalyticsRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    captureInitialAcquisitionContext();
    initPostHogClient();
    initClarityClient();
  }, []);

  useEffect(() => {
    if (!pathname) {
      return;
    }

    setClarityTag("page_group", getPageGroup(pathname));

    const raceId = getRaceIdFromPath(pathname);
    if (raceId) {
      setClarityTag("race_id", raceId);
    }
  }, [pathname]);

  return null;
}

function MissingPrivyConfigNotice() {
  useEffect(() => {
    console.error(
      "[Gridlock] NEXT_PUBLIC_PRIVY_APP_ID is not set. " +
      "Auth will not work until the variable is configured in the active environment."
    );
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = getPrivyAppId();
  const clientId = getPrivyClientId();
  const isEmailOnlyEnvironment = isPrivyEmailOnlyEnvironment();
  const enableEmbeddedWallets = shouldEnablePrivyEmbeddedWallets();

  if (!appId) {
    return (
      <>
        <MissingPrivyConfigNotice />
        {children}
      </>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      {...(clientId ? { clientId } : {})}
      config={{
        // loginMethods is intentionally omitted — Privy will show whatever
        // methods are enabled in the dashboard. Passing methods that are NOT
        // enabled in the dashboard causes Privy to throw internally and the
        // modal never renders (silent failure).
        //
        // Preview deployments run on transient Vercel URLs. Privy's OAuth
        // redirect allowlist uses exact URL matches, so Google/social login
        // can 403 on preview builds even when production works. Limit preview
        // auth to email so the preview remains testable without dashboard
        // changes for every deployment URL.
        appearance: {
          theme: "dark",
          accentColor: "#E8002D",
          logo: "/gridlock logo - transparent.png",
          landingHeader: "Gridlock",
          loginMessage: "Predict the grid. Outsmart the crowd.",
        },
        ...(isEmailOnlyEnvironment ? { loginMethods: ["email"] } : {}),
        ...(enableEmbeddedWallets
          ? {
              embeddedWallets: {
                solana: { createOnLogin: "all-users" },
              },
            }
          : {}),
      }}
    >
      <AnalyticsRuntime />
      {children}
    </PrivyProvider>
  );
}
