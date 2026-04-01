import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

const LockRaceBody = z.object({
  raceId: z.string().min(1, "raceId is required."),
  locked: z.boolean(),
});

// PATCH /api/admin/races/lock — manually lock or unlock a race
export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAdminEmail(user.email)) return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role key missing." }, { status: 503 });

  const parsed = LockRaceBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );

  const { raceId, locked } = parsed.data;

  const { error } = await admin
    .from("races")
    .update({ race_locked: locked, is_locked: locked })
    .eq("id", raceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Freeze popularity snapshot when locking; a no-op when unlocking
  if (locked) {
    const { error: snapshotErr } = await admin.rpc("freeze_pick_popularity", { p_race_id: raceId });
    if (snapshotErr) {
      return NextResponse.json(
        {
          error: `Race was locked, but popularity snapshots were not frozen: ${snapshotErr.message}. Apply the missing Supabase migrations and retry freezing before settlement.`,
          partial: true,
          raceId,
          locked,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, raceId, locked });
}
