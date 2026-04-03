import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

// POST /api/admin/races/seed — seed standard questions for a race
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  const { raceId } = await request.json() as { raceId?: string };
  if (!raceId || typeof raceId !== "string")
    return NextResponse.json({ error: "raceId is required." }, { status: 400 });

  // Confirm race exists
  const { data: race } = await admin.from("races").select("id").eq("id", raceId).single();
  if (!race)
    return NextResponse.json({ error: `Race "${raceId}" not found.` }, { status: 404 });

  // Block duplicate seeding — check existing question count
  const { count: existing } = await admin
    .from("prediction_questions")
    .select("*", { count: "exact", head: true })
    .eq("race_id", raceId);

  if ((existing ?? 0) > 0) {
    return NextResponse.json(
      { error: `Race "${raceId}" already has ${existing} questions seeded. Remove them before re-seeding.`, already_seeded: true },
      { status: 409 }
    );
  }

  // Call the DB function
  const { error: rpcError } = await admin.rpc("seed_race_questions", { p_race_id: raceId });
  if (rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 400 });

  // Return count of what was inserted
  const { count: created } = await admin
    .from("prediction_questions")
    .select("*", { count: "exact", head: true })
    .eq("race_id", raceId);

  return NextResponse.json({ success: true, questions_created: created ?? 0 });
}
