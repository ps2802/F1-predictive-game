import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

const CreateRaceBody = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "id must be lowercase alphanumeric with hyphens only (e.g. japan-2026)").min(1),
  round: z.number().int().min(1).max(30),
  grand_prix_name: z.string().min(1).max(100),
  circuit: z.string().max(100).optional(),
  race_starts_at: z.string().datetime({ offset: true }).optional(),
  qualifying_starts_at: z.string().datetime({ offset: true }).optional(),
});

async function requireAdmin(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdminEmail(user.email)) return { user: null, error: NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 }) };
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

  const parsed = CreateRaceBody.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request body." }, { status: 400 });

  const { id, round, grand_prix_name, circuit, race_starts_at, qualifying_starts_at } = parsed.data;

  // Prevent duplicate slug
  const { data: existing } = await admin.from("races").select("id").eq("id", id).single();
  if (existing)
    return NextResponse.json({ error: `A race with id "${id}" already exists.` }, { status: 409 });

  const { error: insertError } = await admin.from("races").insert({
    id: id.trim(),
    round,
    grand_prix_name: grand_prix_name.trim(),
    circuit: circuit?.trim() || null,
    race_starts_at: race_starts_at ?? null,
    qualifying_starts_at: qualifying_starts_at ?? null,
    season: 2026,
    race_locked: false,
    is_locked: false,
  });

  if (insertError)
    return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ success: true, id });
}
