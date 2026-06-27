import { NextResponse } from "next/server";
import { buildReplayBundle, type ReplayBundle } from "@/lib/openf1";

// Historical replay data is immutable — cache for a day.
export const revalidate = 86400;

type ReplayResponse = (ReplayBundle & { sessionKey: number }) | { error: string };

export async function GET(request: Request): Promise<NextResponse<ReplayResponse>> {
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

  const bundle = await buildReplayBundle(sessionKey);

  return NextResponse.json(
    { sessionKey, ...bundle },
    {
      headers: {
        // Long CDN cache so concurrent dashboard loads coalesce on the edge.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    }
  );
}
