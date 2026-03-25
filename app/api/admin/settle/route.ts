import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SettleBody = z.object({
  raceId: z.string().min(1, "raceId is required."),
});

/**
 * POST /api/admin/settle
 *
 * Enqueues a settlement job and returns immediately (202).
 * The actual scoring runs in /api/cron/settle-races, which Vercel calls
 * every minute — this avoids the 30-second Vercel function timeout.
 *
 * Poll GET /api/admin/settle?jobId=<id> to check progress.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin)
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const parsed = SettleBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );

  const { raceId } = parsed.data;

  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 503 });

  // Guard: refuse to settle an unlocked race
  const { data: raceRow } = await admin
    .from("races")
    .select("race_locked, qualifying_starts_at")
    .eq("id", raceId)
    .single();

  if (!raceRow)
    return NextResponse.json({ error: "Race not found." }, { status: 404 });

  const deadlinePassed =
    raceRow.qualifying_starts_at != null &&
    new Date() >= new Date(raceRow.qualifying_starts_at);

  if (!raceRow.race_locked && !deadlinePassed)
    return NextResponse.json(
      { error: "Race is not locked. Lock the race or wait for the qualifying deadline before settling." },
      { status: 400 }
    );

  // Prevent duplicate pending/running jobs for the same race
  const { data: existingJob } = await admin
    .from("settlement_jobs")
    .select("id, status")
    .eq("race_id", raceId)
    .in("status", ["pending", "running"])
    .single();

  if (existingJob)
    return NextResponse.json(
      { error: `A settlement job for this race is already ${existingJob.status}.`, jobId: existingJob.id },
      { status: 409 }
    );

  const { data: job, error: insertErr } = await admin
    .from("settlement_jobs")
    .insert({ race_id: raceId, created_by: user.id })
    .select("id")
    .single();

  if (insertErr || !job)
    return NextResponse.json({ error: insertErr?.message ?? "Failed to enqueue job." }, { status: 500 });

  return NextResponse.json(
    { success: true, jobId: job.id, message: "Settlement job queued. Processing starts within 1 minute." },
    { status: 202 }
  );
}

/**
 * GET /api/admin/settle?jobId=<id>
 *
 * Returns the current status of a settlement job.
 */
export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin)
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (jobId) {
    const { data: job, error } = await admin
      .from("settlement_jobs")
      .select("id, race_id, status, scores_computed, error_message, created_at, started_at, completed_at")
      .eq("id", jobId)
      .single();

    if (error || !job)
      return NextResponse.json({ error: "Job not found." }, { status: 404 });

    return NextResponse.json({ job });
  }

  // No jobId — return recent jobs
  const { data: jobs } = await admin
    .from("settlement_jobs")
    .select("id, race_id, status, scores_computed, error_message, created_at, started_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ jobs: jobs ?? [] });
}
