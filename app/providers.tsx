"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  captureInitialAcquisitionContext,
  getPageGroup,
  getRaceIdFromPath,
  initClarityClient,
  initPostHogClient,
  setClarityTag,
} from "@/lib/analytics";

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

export function Providers({ children }: { children: React.ReactNode }) {
  // Gridlock is Web2-only with Supabase Google OAuth — no client-side auth
  // provider wrapper is needed. The Supabase browser client is created
  // per-call. This component only mounts the analytics runtime.
  return (
    <>
      <AnalyticsRuntime />
      {children}
    </>
  );
}
