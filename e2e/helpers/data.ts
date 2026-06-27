import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * e2e/helpers/data.ts — read the live DB (service role) to discover real race
 * state for the canary, and to build a minimal VALID prediction body. We answer
 * only pole_sitter + winner (both single-pick) so the submission is always valid
 * and never trips the winner-not-in-podium cross-question rule.
 */

export interface RaceQuestion {
  id: string;
  question_type: string;
  category: string;
  multi_select: number;
  options: { id: string; option_value: string }[];
}

export async function getRaceQuestions(
  admin: SupabaseClient,
  raceId: string
): Promise<RaceQuestion[]> {
  const { data: questions, error } = await admin
    .from("prediction_questions")
    .select("id, question_type, category, multi_select")
    .eq("race_id", raceId);
  if (error) throw new Error(`[e2e] questions(${raceId}): ${error.message}`);
  if (!questions || questions.length === 0) return [];

  const ids = questions.map((q) => q.id);
  const { data: options, error: optErr } = await admin
    .from("prediction_options")
    .select("id, question_id, option_value")
    .in("question_id", ids);
  if (optErr) throw new Error(`[e2e] options(${raceId}): ${optErr.message}`);

  return questions.map((q) => ({
    id: q.id,
    question_type: q.question_type,
    category: q.category,
    multi_select: q.multi_select ?? 1,
    options: (options ?? [])
      .filter((o) => o.question_id === q.id)
      .map((o) => ({ id: o.id, option_value: o.option_value })),
  }));
}

/** The next OPEN race (not locked) that actually has seeded questions. */
export async function findOpenRaceWithQuestions(
  admin: SupabaseClient
): Promise<{ id: string; questions: RaceQuestion[] } | null> {
  const { data: races } = await admin
    .from("races")
    .select("id, round, race_locked")
    .eq("race_locked", false)
    .order("round", { ascending: true });
  for (const race of races ?? []) {
    const questions = await getRaceQuestions(admin, race.id);
    if (questions.length > 0) return { id: race.id, questions };
  }
  return null;
}

/** A LOCKED race with questions (for the after-lock rejection check). */
export async function findLockedRaceWithQuestions(
  admin: SupabaseClient
): Promise<{ id: string; questions: RaceQuestion[] } | null> {
  const { data: races } = await admin
    .from("races")
    .select("id, round, race_locked, lock_time_utc")
    .order("round", { ascending: true });
  const nowIso = new Date().toISOString();
  for (const race of races ?? []) {
    const locked =
      race.race_locked === true ||
      (typeof race.lock_time_utc === "string" && race.lock_time_utc <= nowIso);
    if (!locked) continue;
    const questions = await getRaceQuestions(admin, race.id);
    if (questions.length > 0) return { id: race.id, questions };
  }
  return null;
}

/** A SETTLED race (has at least one race_scores row), for read-only checks. */
export async function findSettledRaceId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("race_scores")
    .select("race_id")
    .limit(1);
  return data && data.length > 0 ? data[0].race_id : null;
}

/** Minimal valid answers: pole_sitter + winner, each one pick. */
export function buildMinimalAnswers(
  questions: RaceQuestion[],
  variant = 0
): Record<string, string[]> {
  const answers: Record<string, string[]> = {};
  for (const type of ["pole_sitter", "winner"]) {
    const q = questions.find((x) => x.question_type === type && x.options.length > 0);
    if (q) {
      const idx = Math.min(variant, q.options.length - 1);
      answers[q.id] = [q.options[idx].id];
    }
  }
  return answers;
}

/** Any single valid answer for a (locked) race — used only to trip the lock. */
export function buildAnyAnswer(questions: RaceQuestion[]): Record<string, string[]> {
  const q = questions.find((x) => x.options.length > 0);
  return q ? { [q.id]: [q.options[0].id] } : {};
}
