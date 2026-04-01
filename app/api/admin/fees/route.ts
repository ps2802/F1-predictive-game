import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Total fees collected
  const { data: totals } = await supabase
    .from("fee_wallet_total")
    .select("*");

  // Recent fee events (last 50)
  const { data: recentFees } = await supabase
    .from("fee_wallet")
    .select("id, amount, currency, league_id, description, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Fee breakdown by source (league rake vs edit fees)
  const { data: breakdown } = await supabase
    .from("fee_wallet")
    .select("description, amount");

  const leagueRake = (breakdown ?? [])
    .filter((r) => r.description?.toLowerCase().includes("rake"))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const editFees = (breakdown ?? [])
    .filter((r) => r.description?.toLowerCase().includes("edit"))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return NextResponse.json({
    totals: totals ?? [],
    recentFees: recentFees ?? [],
    breakdown: {
      leagueRake,
      editFees,
      total: leagueRake + editFees,
    },
  });
}
