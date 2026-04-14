"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function LandingPageAnalytics() {
  useEffect(() => {
    track("landing_viewed");
  }, []);

  return null;
}
