import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/lock-races
 *
 * Locks any race whose qualifying session has started but whose
 * race_locked flag is still false — so admin doesn't have to do it manually.
 *
 * Intended to run every 5 minutes. Call via an external cron service
 * (e.g. cron-job.org, GitHub Actions) or upgrade to Vercel Pro for
 * native Vercel Cron support with sub-daily schedules.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 * Pass CRON_SECRET as the bearer token from your cron service.
 *
 * Manual oversight still needed:
 *   - qualifying_starts_at must be set for each race (via admin panel / migration).
 *   - If a race needs to stay open past qualifying (unusual), remove the
 *     qualifying_starts_at instead to prevent re-locking.
 */
export async function GET(request: NextRequest) {
  // CRON_SECRET must always be set in production. Reject the request if
  // the secret is missing (misconfigured deployment) or doesn't match.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET env var not configured." }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  const now = new Date().toISOString();

  // Find races that should be locked (qualifying started, not yet locked)
  const { data: racesToLock, error: fetchErr } = await admin
    .from("races")
    .select("id, grand_prix_name, qualifying_starts_at")
    .eq("race_locked", false)
    .not("qualifying_starts_at", "is", null)
    .lte("qualifying_starts_at", now);

  if (fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  if (!racesToLock || racesToLock.length === 0)
    return NextResponse.json({ locked: [] });

  const ids = racesToLock.map((r) => r.id);

  const { error: updateErr } = await admin
    .from("races")
    .update({ race_locked: true })
    .in("id", ids);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Snapshot pick popularity at lock time so settlement uses deterministic data
  const snapshotErrors: { raceId: string; error: string }[] = [];
  for (const raceId of ids) {
    const { error: snapshotErr } = await admin.rpc("freeze_pick_popularity", { p_race_id: raceId });
    if (snapshotErr) {
      snapshotErrors.push({ raceId, error: snapshotErr.message });
    }

    // Void draft predictions — they were never paid/entered so should not score
    await admin
      .from("predictions")
      .update({ status: "locked" })
      .eq("race_id", raceId)
      .eq("status", "draft");
  }

  if (snapshotErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Some races were locked, but popularity snapshots were not frozen. Apply the missing Supabase migrations and retry before settlement.",
        locked: ids,
        count: ids.length,
        lockedAt: now,
        snapshotsFrozen: ids.length - snapshotErrors.length,
        snapshotErrors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    locked: ids,
    count: ids.length,
    lockedAt: now,
    snapshotsFrozen: ids.length,
  });
}
