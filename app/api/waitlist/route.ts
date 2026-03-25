import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const { error } = await supabase.from("waitlist").insert({ email });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already on the grid." }, { status: 409 });
    }
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
