import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

  // Check admin flag
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin)
    return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const { raceId, results } = (await request.json()) as {
    raceId: string;
    results: Array<{
      question_id: string;
      correct_option_id: string;
      pick_order: number;
    }>;
  };

  if (!raceId || !Array.isArray(results) || results.length === 0)
    return NextResponse.json({ error: "Missing raceId or results." }, { status: 400 });

  // Use admin client for writes (bypasses RLS)
  const admin = createSupabaseAdminClient();
  if (!admin)
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured." },
      { status: 503 }
    );

  await admin.from("race_results").delete().eq("race_id", raceId);

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
  await admin
    .from("races")
    .update({ race_locked: true, is_locked: true })
    .eq("id", raceId);

  return NextResponse.json({ success: true });
}
