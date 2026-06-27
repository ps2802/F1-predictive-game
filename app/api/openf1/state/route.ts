import { NextResponse } from "next/server";
import { resolveOpenF1State, type OpenF1StateResult } from "@/lib/openf1";

// Short revalidate so we detect a session going live/ending quickly.
export const revalidate = 30;

export async function GET(): Promise<NextResponse<OpenF1StateResult>> {
  const state = await resolveOpenF1State();
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
    },
  });
}
