import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

const ResultsBody = z.object({
  raceId: z.string().min(1),
  results: z.array(z.object({
    question_id: z.string().min(1),
    correct_option_id: z.string().min(1),
    pick_order: z.number().int().min(1).default(1),
  })).min(1),
});

// Admin-only: submit race results per question
export async function POST(request: Request) {
  // Authenticate with anon client (reads cookies)
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAdminEmail(user.email))
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  // Check admin flag
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin)
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const parsed = ResultsBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 });

  const { raceId, results } = parsed.data;

  // Use admin client for writes (bypasses RLS)
  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured." },
      { status: 503 }
    );

  const { error: schemaErr } = await admin.from("races").select("id, race_locked").limit(1);
  if (schemaErr) {
    return NextResponse.json(
      {
        error: `Results cannot be saved on this database because it is behind the current schema: ${schemaErr.message}. Apply the missing Supabase migrations and retry.`,
      },
      { status: 503 }
    );
  }

  const { error: deleteErr } = await admin.from("race_results").delete().eq("race_id", raceId);
  if (deleteErr)
    return NextResponse.json({ error: deleteErr.message }, { status: 400 });

  const { error: insertErr } = await admin.from("race_results").insert(
    results.map((r) => ({
      race_id: raceId,
      question_id: r.question_id,
      correct_option_id: r.correct_option_id,
      pick_order: r.pick_order ?? 1,
    }))
  );

  if (insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 400 });

  // Lock the race
  const { error: lockErr } = await admin
    .from("races")
    .update({ race_locked: true })
    .eq("id", raceId);

  if (lockErr) {
    return NextResponse.json(
      {
        error: `Results were saved, but the race lock step failed: ${lockErr.message}. Apply the missing Supabase migrations and retry the lock before settling.`,
        partial: true,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
