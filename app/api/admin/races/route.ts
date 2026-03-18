import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function requireAdmin(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { user: null, error: NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 }) };
  return { user, error: null };
}

// GET /api/admin/races — list all races with question count
export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const { error: authErr } = await requireAdmin(supabase);
  if (authErr) return authErr;

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  const { data, error } = await admin
    .from("races")
    .select("id, season, round, grand_prix_name, circuit, race_starts_at, qualifying_starts_at, race_locked, is_locked, prediction_questions(count)")
    .order("round");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const races = (data ?? []).map((r) => ({
    id: r.id,
    season: r.season,
    round: r.round,
    grand_prix_name: r.grand_prix_name,
    circuit: r.circuit,
    race_starts_at: r.race_starts_at,
    qualifying_starts_at: r.qualifying_starts_at,
    race_locked: r.race_locked,
    is_locked: r.is_locked,
    question_count: (r.prediction_questions as unknown as { count: number }[])?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ races });
}

// POST /api/admin/races — create a new race
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const { error: authErr } = await requireAdmin(supabase);
  if (authErr) return authErr;

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  const body = await request.json() as {
    id?: unknown;
    round?: unknown;
    grand_prix_name?: unknown;
    circuit?: unknown;
    race_starts_at?: unknown;
    qualifying_starts_at?: unknown;
  };

  const { id, round, grand_prix_name, circuit, race_starts_at, qualifying_starts_at } = body;

  if (!id || typeof id !== "string" || id.trim().length === 0)
    return NextResponse.json({ error: "id (slug) is required." }, { status: 400 });
  if (!/^[a-z0-9-]+$/.test(id as string))
    return NextResponse.json({ error: "id must be lowercase alphanumeric with hyphens only (e.g. japan-2026)." }, { status: 400 });
  if (!round || typeof round !== "number" || !Number.isInteger(round) || round < 1 || round > 30)
    return NextResponse.json({ error: "round must be an integer between 1 and 30." }, { status: 400 });
  if (!grand_prix_name || typeof grand_prix_name !== "string" || (grand_prix_name as string).trim().length === 0)
    return NextResponse.json({ error: "grand_prix_name is required." }, { status: 400 });

  // Prevent duplicate slug
  const { data: existing } = await admin.from("races").select("id").eq("id", id).single();
  if (existing)
    return NextResponse.json({ error: `A race with id "${id}" already exists.` }, { status: 409 });

  const { error: insertError } = await admin.from("races").insert({
    id: (id as string).trim(),
    round: round as number,
    grand_prix_name: (grand_prix_name as string).trim(),
    circuit: circuit && typeof circuit === "string" ? (circuit as string).trim() || null : null,
    race_starts_at: race_starts_at && typeof race_starts_at === "string" ? race_starts_at : null,
    qualifying_starts_at: qualifying_starts_at && typeof qualifying_starts_at === "string" ? qualifying_starts_at : null,
    season: 2026,
    race_locked: false,
    is_locked: false,
  });

  if (insertError)
    return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ success: true, id });
}
