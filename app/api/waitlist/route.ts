import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

const WaitlistBody = z.object({
  email: z.string().email("Valid email required.").toLowerCase().trim(),
});

export async function POST(req: NextRequest) {
  // Rate limit: 5 signups per IP per hour
  const ip = getClientIp(req.headers);
  if (await isRateLimited(`waitlist:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429 });
  }
  const parsed = WaitlistBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Valid email required." },
      { status: 400 }
    );

  const { email } = parsed.data;

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const { error } = await supabase.from("waitlist").insert({ email });

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Already on the grid." }, { status: 409 });
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
