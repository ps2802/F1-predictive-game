import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

const CreateLeagueBody = z.object({
  name: z.string().trim().min(1, "League name is required.").max(60),
  description: z.string().trim().max(280).optional(),
  type: z.enum(["public", "private"]).default("private"),
  // Leagues are season-wide by default; an optional race scopes to one round.
  race_id: z.string().min(1).nullable().optional(),
  max_users: z.number().int().min(2).max(10000).default(1000),
});

// Unambiguous uppercase alphabet (no 0/O/1/I) for human-shareable codes.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 }),
      supabase: null,
      user: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase,
      user: null,
    };
  }

  return { error: null, supabase, user };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser();
  if (auth.error || !auth.supabase || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const raceId = url.searchParams.get("raceId");

  let leagueQuery = auth.supabase
    .from("leagues")
    .select("*, member_count")
    .or(`type.eq.public,creator_id.eq.${auth.user.id}`)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (raceId) {
    leagueQuery = leagueQuery.eq("race_id", raceId);
  }

  const { data: leagues, error } = await leagueQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const leagueIds = (leagues ?? []).map((league) => league.id);
  const membershipQuery = auth.supabase
    .from("league_members")
    .select("league_id")
    .eq("user_id", auth.user.id);

  const { data: memberships, error: membershipsError } =
    raceId && leagueIds.length > 0
      ? await membershipQuery.in("league_id", leagueIds)
      : raceId
        ? { data: [], error: null }
        : await membershipQuery;

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 400 });
  }

  const joinedIds = new Set((memberships ?? []).map((membership) => membership.league_id));

  return NextResponse.json({
    leagues: (leagues ?? []).map((league) => ({
      ...league,
      is_member: joinedIds.has(league.id),
    })),
  });
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  if (await isRateLimited(`leagues-create:${ip}`, 10, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const auth = await getAuthenticatedUser();
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const parsed = CreateLeagueBody.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  const { name, description, type, race_id, max_users } = parsed.data;

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 500 });
  }

  // Insert the league, retrying on invite-code collision (UNIQUE(invite_code)).
  let league: { id: string } | null = null;
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const inviteCode = generateInviteCode();
    const { data, error } = await admin
      .from("leagues")
      .insert({
        creator_id: auth.user.id,
        name,
        description: description ?? null,
        type,
        race_id: race_id ?? null,
        max_users,
        invite_code: inviteCode,
        member_count: 1,
        is_active: true,
      })
      .select("*")
      .single();

    if (!error && data) {
      league = data;
      break;
    }
    lastError = error?.message ?? "League could not be created.";
    // 23505 = unique_violation (invite_code clash) → retry with a fresh code.
    if (error?.code !== "23505") {
      return NextResponse.json({ error: lastError }, { status: 400 });
    }
  }

  if (!league) {
    return NextResponse.json(
      { error: lastError ?? "Could not generate a unique invite code. Try again." },
      { status: 500 }
    );
  }

  const { error: memberError } = await admin
    .from("league_members")
    .insert({ league_id: league.id, user_id: auth.user.id });

  if (memberError) {
    // Roll back the orphaned league so the creator isn't locked out of a league
    // they can't join.
    await admin.from("leagues").delete().eq("id", league.id);
    return NextResponse.json(
      { error: "League created, but you could not be added as a member. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ league }, { status: 201 });
}
