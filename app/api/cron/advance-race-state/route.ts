import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/advance-race-state
 *
 * Called by an external cron (e.g. cron-job.org) on a regular schedule.
 * Vercel Hobby plan does not support sub-daily native crons, so this endpoint
 * must be triggered externally — see INTEGRATIONS.md for setup instructions.
 *
 * Transitions races through their lifecycle:
 *   upcoming → active   when the lock anchor (lock_time_utc, fallback
 *                       qualifying_starts_at) has passed AND race_locked = true
 *   active   → completed  when race_starts_at + 4 hours has passed
 *   upcoming → completed  safety net for any race that was never marked active
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 * Returns 503 if the CRON_SECRET env var is not set (misconfigured deployment).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET env var not set." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Service role key missing." },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  const [activatedCount, completedCount] = await Promise.all([
    markRacesActive(admin, now),
    markRacesCompleted(admin, fourHoursAgo),
  ]);

  if (activatedCount instanceof Error) {
    return NextResponse.json(
      { error: activatedCount.message },
      { status: 500 }
    );
  }
  if (completedCount instanceof Error) {
    return NextResponse.json(
      { error: completedCount.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    activatedCount,
    completedCount,
    checkedAt: now,
  });
}

/**
 * Marks races as "active" once their lock anchor has passed and predictions are
 * locked. The anchor is lock_time_utc (the first grid-setting session) with
 * qualifying_starts_at as a fallback. Only transitions from "upcoming" — never
 * rewinds completed races.
 */
async function markRacesActive(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  now: string
): Promise<number | Error> {
  const { data: toActivate, error: fetchErr } = await admin
    .from("races")
    .select("id, lock_time_utc, qualifying_starts_at")
    .eq("status", "upcoming")
    .eq("race_locked", true);

  if (fetchErr) return new Error(fetchErr.message);
  if (!toActivate || toActivate.length === 0) return 0;

  const nowMs = new Date(now).getTime();
  const ids = toActivate
    .filter((r: { lock_time_utc: string | null; qualifying_starts_at: string | null }) => {
      const anchor = r.lock_time_utc ?? r.qualifying_starts_at;
      return anchor != null && new Date(anchor).getTime() <= nowMs;
    })
    .map((r: { id: string }) => r.id);

  if (ids.length === 0) return 0;

  const { error: updateErr } = await admin
    .from("races")
    .update({ status: "active" })
    .in("id", ids);

  if (updateErr) return new Error(updateErr.message);

  return ids.length;
}

/**
 * Marks races as "completed" once 4 hours have elapsed since race_starts_at.
 * Transitions both "upcoming" and "active" races (handles any that were skipped).
 */
async function markRacesCompleted(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  fourHoursAgo: string
): Promise<number | Error> {
  const { data: toComplete, error: fetchErr } = await admin
    .from("races")
    .select("id")
    .neq("status", "completed")
    .lte("race_starts_at", fourHoursAgo);

  if (fetchErr) return new Error(fetchErr.message);
  if (!toComplete || toComplete.length === 0) return 0;

  const ids = toComplete.map((r: { id: string }) => r.id);

  const { error: updateErr } = await admin
    .from("races")
    .update({ status: "completed" })
    .in("id", ids);

  if (updateErr) return new Error(updateErr.message);

  return ids.length;
}
