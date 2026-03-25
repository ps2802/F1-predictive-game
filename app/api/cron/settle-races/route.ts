import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runSettlement } from "@/lib/scoring/runSettlement";

/**
 * GET /api/cron/settle-races
 *
 * Intended to run every minute. Call via an external cron service
 * (e.g. cron-job.org, GitHub Actions) or upgrade to Vercel Pro for
 * native Vercel Cron support with sub-daily schedules.
 * Picks up the oldest pending settlement job, processes it, and marks it
 * done or failed. Processes one job per invocation to stay within the
 * 30-second Vercel function timeout even for large player pools.
 *
 * Security: requires Authorization: Bearer <CRON_SECRET> header.
 * Jobs stuck in 'running' for > 10 minutes are treated as stalled and
 * re-queued (set back to 'pending').
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret)
    return NextResponse.json({ error: "CRON_SECRET env var not configured." }, { status: 503 });

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  // Recover stalled jobs (running for > 10 minutes) back to pending
  await admin
    .from("settlement_jobs")
    .update({ status: "pending", started_at: null })
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  // Pick the oldest pending job
  const { data: job } = await admin
    .from("settlement_jobs")
    .select("id, race_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!job) return NextResponse.json({ processed: 0, message: "No pending jobs." });

  // Mark running
  await admin
    .from("settlement_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id);

  try {
    const { scores_computed } = await runSettlement(job.race_id, admin);

    await admin
      .from("settlement_jobs")
      .update({
        status: "done",
        scores_computed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json({ processed: 1, jobId: job.id, race_id: job.race_id, scores_computed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    await admin
      .from("settlement_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    return NextResponse.json(
      { processed: 1, jobId: job.id, race_id: job.race_id, error: message },
      { status: 500 }
    );
  }
}
