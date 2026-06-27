import { NextResponse } from "next/server";
import { getLivePositions, type LivePositionsResult } from "@/lib/openf1";

// Live positions change constantly; do not cache at the framework layer.
export const revalidate = 0;

type LiveResponse = LivePositionsResult | { error: string };

export async function GET(request: Request): Promise<NextResponse<LiveResponse>> {
  const { searchParams } = new URL(request.url);
  const rawSessionKey = searchParams.get("sessionKey");
  const sessionKey = Number(rawSessionKey);

  if (
    rawSessionKey === null ||
    !Number.isInteger(sessionKey) ||
    sessionKey <= 0
  ) {
    return NextResponse.json(
      { error: "sessionKey must be a positive integer." },
      { status: 400 }
    );
  }

  // When no credential is present, getLivePositions returns empty cars (not a
  // 500) so the client can keep showing replay/static.
  const result = await getLivePositions(sessionKey);

  return NextResponse.json(result, {
    headers: {
      // Tiny shared-cache window lets the proxy coalesce a burst of polls.
      "Cache-Control": "public, max-age=2, s-maxage=2",
    },
  });
}
