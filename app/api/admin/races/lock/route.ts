import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// PATCH /api/admin/races/lock — manually lock or unlock a race
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  const { raceId, locked } = await request.json() as { raceId?: string; locked?: unknown };

  if (!raceId || typeof raceId !== "string")
    return NextResponse.json({ error: "raceId is required." }, { status: 400 });
  if (typeof locked !== "boolean")
    return NextResponse.json({ error: "locked (boolean) is required." }, { status: 400 });

  const { error } = await admin
    .from("races")
    .update({ race_locked: locked, is_locked: locked })
    .eq("id", raceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true, raceId, locked });
}
