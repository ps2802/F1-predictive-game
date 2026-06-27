import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";
import {
  fetchQualifyingResults,
  fetchRaceResults,
  normalizeDriverName,
} from "@/lib/jolpicaResults";

const SyncBody = z.object({
  raceId: z.string().regex(/^[a-z0-9-]+$/, "raceId must be a race slug.").min(1),
  season: z.number().int().min(2017).max(2100),
  round: z.number().int().min(1).max(30),
});

type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function requireAdmin(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden: admin only." }, { status: 403 }) };
  }
  return { ok: true };
}

type QuestionRow = {
  id: string;
  question_type: string;
};

type OptionRow = {
  id: string;
  question_id: string;
  option_value: string;
};

type ResultUpsertRow = {
  race_id: string;
  question_id: string;
  correct_option_id: string;
  pick_order: number;
};

type CategoryOutcome = {
  questionType: string;
  status: "settled" | "skipped" | "missing_data" | "unmatched_option";
  detail?: string;
};

/** Driver picks per question_type, each as an ordered list (pick_order = index + 1). */
function buildDriverPicks(
  qualifying: Awaited<ReturnType<typeof fetchQualifyingResults>>,
  race: Awaited<ReturnType<typeof fetchRaceResults>>
): Record<string, { drivers: string[]; available: boolean }> {
  return {
    pole_sitter: {
      available: qualifying.available && qualifying.pole != null,
      drivers: qualifying.pole != null ? [qualifying.pole] : [],
    },
    winner: {
      available: race.available && race.winner != null,
      drivers: race.winner != null ? [race.winner] : [],
    },
    // Podium question covers P2 & P3 (pick_order 1 = P2, pick_order 2 = P3).
    podium: {
      available: race.available && race.podium != null,
      drivers: race.podium != null ? [race.podium[1], race.podium[2]] : [],
    },
    fastest_lap: {
      available: race.available && race.fastestLap != null,
      drivers: race.fastestLap != null ? [race.fastestLap] : [],
    },
    most_positions_gained: {
      available: race.available && race.biggestGainer != null,
      drivers: race.biggestGainer != null ? [race.biggestGainer] : [],
    },
  };
}

function findOptionId(
  options: OptionRow[],
  questionId: string,
  driverName: string
): string | null {
  const target = normalizeDriverName(driverName);
  const match = options.find(
    (o) => o.question_id === questionId && normalizeDriverName(o.option_value) === target
  );
  return match?.id ?? null;
}

/**
 * POST /api/admin/results/sync
 *
 * Admin-gated. Fetches Jolpica qualifying + race results for { season, round },
 * maps them onto this race's prediction_questions/prediction_options, and
 * upserts race_results rows for pole/winner/podium/fastest_lap/
 * most_positions_gained. Safety cars are NOT in Jolpica, so that category is
 * left for manual admin entry. Idempotent per question (delete + insert).
 *
 * This only populates race_results — it does NOT settle scores. Settlement
 * stays a separate admin "Trigger Settlement" step.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });
  }

  const auth = await requireAdmin(supabase);
  if (!auth.ok) {
    return auth.response;
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role key missing." }, { status: 503 });
  }

  const parsed = SyncBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  const { raceId, season, round } = parsed.data;

  const { data: raceRow, error: raceErr } = await admin
    .from("races")
    .select("id")
    .eq("id", raceId)
    .single();
  if (raceErr || !raceRow) {
    return NextResponse.json({ error: `Race "${raceId}" not found.` }, { status: 404 });
  }

  const { data: questions, error: questionsErr } = await admin
    .from("prediction_questions")
    .select("id, question_type")
    .eq("race_id", raceId);
  if (questionsErr) {
    return NextResponse.json({ error: questionsErr.message }, { status: 500 });
  }
  if (!questions || questions.length === 0) {
    return NextResponse.json(
      { error: `No prediction questions seeded for race "${raceId}".` },
      { status: 409 }
    );
  }

  const questionIds = (questions as QuestionRow[]).map((q) => q.id);
  const { data: options, error: optionsErr } = await admin
    .from("prediction_options")
    .select("id, question_id, option_value")
    .in("question_id", questionIds);
  if (optionsErr) {
    return NextResponse.json({ error: optionsErr.message }, { status: 500 });
  }

  let qualifying: Awaited<ReturnType<typeof fetchQualifyingResults>>;
  let race: Awaited<ReturnType<typeof fetchRaceResults>>;
  try {
    [qualifying, race] = await Promise.all([
      fetchQualifyingResults(season, round),
      fetchRaceResults(season, round),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jolpica fetch failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const picksByType = buildDriverPicks(qualifying, race);
  const optionRows = (options ?? []) as OptionRow[];

  const outcomes = await settleQuestions(
    admin,
    raceId,
    questions as QuestionRow[],
    optionRows,
    picksByType
  );

  if (outcomes instanceof Error) {
    return NextResponse.json({ error: outcomes.message }, { status: 500 });
  }

  // Map internal question_type keys to the admin UI's category keys.
  const UI_CATEGORY_KEY: Record<string, string> = {
    pole_sitter: "pole",
    winner: "winner",
    podium: "podium",
    fastest_lap: "fastest_lap",
    most_positions_gained: "biggest_gainer",
  };
  const settled = outcomes
    .filter((o) => o.status === "settled")
    .map((o) => UI_CATEGORY_KEY[o.questionType] ?? o.questionType);
  const needsManualEntry = outcomes
    .filter((o) => o.status === "skipped" || o.status === "missing_data")
    .map((o) => o.questionType);
  const unmatched = outcomes.filter((o) => o.status === "unmatched_option");

  return NextResponse.json({
    raceId,
    season,
    round,
    settled,
    needsManualEntry,
    // safety_cars is never in Jolpica — always manual.
    manualOnly: ["safety_cars"],
    unmatched: unmatched.map((o) => ({ questionType: o.questionType, detail: o.detail })),
    sources: {
      qualifyingAvailable: qualifying.available,
      raceAvailable: race.available,
    },
  });
}

/**
 * For each settleable question_type, resolves the correct option ids and
 * idempotently replaces that question's race_results rows (delete + insert).
 * Returns per-category outcomes, or an Error on a database failure.
 */
async function settleQuestions(
  admin: SupabaseAdminClient,
  raceId: string,
  questions: QuestionRow[],
  options: OptionRow[],
  picksByType: Record<string, { drivers: string[]; available: boolean }>
): Promise<CategoryOutcome[] | Error> {
  const outcomes: CategoryOutcome[] = [];

  for (const question of questions) {
    const pick = picksByType[question.question_type];

    // Categories Jolpica cannot settle (safety_cars and any others) are left
    // untouched for manual admin entry.
    if (!pick) {
      outcomes.push({ questionType: question.question_type, status: "skipped" });
      continue;
    }

    if (!pick.available || pick.drivers.length === 0) {
      outcomes.push({ questionType: question.question_type, status: "missing_data" });
      continue;
    }

    const rows: ResultUpsertRow[] = [];
    const unmatchedDrivers: string[] = [];
    pick.drivers.forEach((driver, index) => {
      const optionId = findOptionId(options, question.id, driver);
      if (optionId == null) {
        unmatchedDrivers.push(driver);
        return;
      }
      rows.push({
        race_id: raceId,
        question_id: question.id,
        correct_option_id: optionId,
        pick_order: index + 1,
      });
    });

    if (unmatchedDrivers.length > 0) {
      outcomes.push({
        questionType: question.question_type,
        status: "unmatched_option",
        detail: `Could not map driver(s): ${unmatchedDrivers.join(", ")}`,
      });
      continue;
    }

    const { error: deleteErr } = await admin
      .from("race_results")
      .delete()
      .eq("race_id", raceId)
      .eq("question_id", question.id);
    if (deleteErr) {
      return new Error(deleteErr.message);
    }

    const { error: insertErr } = await admin.from("race_results").insert(rows);
    if (insertErr) {
      return new Error(insertErr.message);
    }

    outcomes.push({ questionType: question.question_type, status: "settled" });
  }

  return outcomes;
}
