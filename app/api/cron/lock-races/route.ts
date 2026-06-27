import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/analytics.server";

/**
 * GET /api/cron/lock-races
 *
 * Locks any race whose lock anchor (lock_time_utc — the start of the first
 * grid-setting competitive session of the weekend) has passed but whose
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
 *   - lock_time_utc (or qualifying_starts_at as fallback) must be set for each
 *     race (seeded from Jolpica via scripts/seed-races.ts, or via admin panel).
 *   - If a race needs to stay open past its first session (unusual), clear the
 *     lock anchor to prevent re-locking.
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

  const now = new Date();
  const nowIso = now.toISOString();

  // Find races that are not yet locked, then anchor the lock to lock_time_utc
  // (the first grid-setting session) with qualifying_starts_at as a fallback.
  // Filtering on the coalesced anchor is done in code so a single column is
  // authoritative regardless of which timing fields are populated.
  const { data: unlockedRaces, error: fetchErr } = await admin
    .from("races")
    .select("id, grand_prix_name, lock_time_utc, qualifying_starts_at")
    .eq("race_locked", false);

  if (fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  const ids = (unlockedRaces ?? [])
    .filter((r) => {
      const anchor = r.lock_time_utc ?? r.qualifying_starts_at;
      return anchor != null && new Date(anchor).getTime() <= now.getTime();
    })
    .map((r) => r.id);

  if (ids.length === 0)
    return NextResponse.json({ locked: [] });

  const { error: updateErr } = await admin
    .from("races")
    .update({ race_locked: true })
    .in("id", ids);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Snapshot pick popularity at lock time so settlement uses deterministic data.
  // Predictions are 'active' from submission and are NOT voided/flipped at lock —
  // locking only stops further edits and freezes the popularity snapshot.
  const snapshotErrors: { raceId: string; error: string }[] = [];
  for (const raceId of ids) {
    const { error: snapshotErr } = await admin.rpc("freeze_pick_popularity", { p_race_id: raceId });
    if (snapshotErr) {
      snapshotErrors.push({ raceId, error: snapshotErr.message });
    }
  }

  if (snapshotErrors.length > 0) {
    return NextResponse.json(
      {
        error: "Some races were locked, but popularity snapshots were not frozen. Apply the missing Supabase migrations and retry before settlement.",
        locked: ids,
        count: ids.length,
        lockedAt: nowIso,
        snapshotsFrozen: ids.length - snapshotErrors.length,
        snapshotErrors,
      },
      { status: 500 }
    );
  }

  await Promise.all(
    ids.map((raceId) =>
      trackServer("race_locked", {
        race_id: raceId,
      })
    )
  );

  return NextResponse.json({
    locked: ids,
    count: ids.length,
    lockedAt: nowIso,
    snapshotsFrozen: ids.length,
  });
}
