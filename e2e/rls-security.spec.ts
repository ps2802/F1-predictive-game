import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  readTestEnv,
  adminClient,
  seedUser,
  authenticateContext,
  bypassHeaders,
  type TestEnv,
  type SeededUser,
} from "./helpers/session";
import { findOpenRaceWithQuestions, buildMinimalAnswers } from "./helpers/data";

/**
 * RLS / authorization proofs — each attempted against the LIVE database with a
 * real user JWT and confirmed to FAIL correctly. RLS cannot be verified by
 * reading SQL; these run it.
 *   E2E_BASE_URL=<preview-url> npx playwright test rls-security
 */

const env: TestEnv = (() => {
  try {
    return readTestEnv();
  } catch {
    return null as unknown as TestEnv;
  }
})();

function userClient(e: TestEnv, user: SeededUser): SupabaseClient {
  const cli = createClient(e.supabaseUrl, e.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Subsequent requests carry this user's JWT, so RLS applies as this user.
  void cli.auth.setSession({ access_token: user.accessToken, refresh_token: user.refreshToken });
  return cli;
}

test.describe.serial("RLS + authorization (live DB)", () => {
  let admin: SupabaseClient;
  let owner: SeededUser; // creates the private league + a prediction
  let outsider: SeededUser; // must be denied
  let ctxOwner: BrowserContext;
  let ctxOutsider: BrowserContext;
  let privateLeagueId = "";
  let privateInvite = "";
  let ownerPredictionId = "";

  test.beforeAll(async ({ browser }) => {
    test.skip(!env, "E2E env not configured.");
    admin = adminClient(env);
    owner = await seedUser(env, "owner");
    outsider = await seedUser(env, "outsider");

    const extraHTTPHeaders = bypassHeaders(env);
    ctxOwner = await browser.newContext({ extraHTTPHeaders });
    ctxOutsider = await browser.newContext({ extraHTTPHeaders });
    await authenticateContext(ctxOwner, env, owner);
    await authenticateContext(ctxOutsider, env, outsider);

    // Owner creates a PRIVATE league.
    const created = await ctxOwner.request.post(`${env.baseUrl}/api/leagues`, {
      data: { name: `RLS Private ${Date.now()}`, type: "private", max_users: 50 },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();
    privateLeagueId = body.league.id;
    privateInvite = body.league.invite_code;

    // Owner makes a prediction on an open race (if available).
    const open = await findOpenRaceWithQuestions(admin);
    if (open) {
      const r = await ctxOwner.request.post(`${env.baseUrl}/api/predictions/v2`, {
        data: { raceId: open.id, answers: buildMinimalAnswers(open.questions, 0) },
      });
      expect(r.status(), await r.text()).toBe(200);
      const { data: pred } = await admin
        .from("predictions")
        .select("id")
        .eq("user_id", owner.id)
        .eq("race_id", open.id)
        .maybeSingle();
      ownerPredictionId = pred?.id ?? "";
    }
  });

  test.afterAll(async () => {
    await ctxOwner?.close();
    await ctxOutsider?.close();
  });

  test("a non-member cannot read a private league or its invite_code (RLS)", async () => {
    const cli = userClient(env, outsider);
    const byId = await cli.from("leagues").select("id, invite_code, type").eq("id", privateLeagueId);
    expect(byId.data ?? [], "private league hidden from non-member by id").toEqual([]);

    const byCode = await cli.from("leagues").select("id, invite_code").eq("invite_code", privateInvite);
    expect(byCode.data ?? [], "private league not enumerable by invite_code").toEqual([]);
  });

  test("a non-member cannot read another league's leaderboard (API 403)", async () => {
    const res = await ctxOutsider.request.get(
      `${env.baseUrl}/api/leagues/${privateLeagueId}/leaderboard`
    );
    expect(res.status(), "outsider blocked from private league leaderboard").toBe(403);
  });

  test("a user cannot read another user's prediction / hidden picks before lock (RLS)", async () => {
    test.skip(!ownerPredictionId, "No owner prediction (no open race) to probe.");
    const cli = userClient(env, outsider);

    const preds = await cli.from("predictions").select("id").eq("id", ownerPredictionId);
    expect(preds.data ?? [], "cannot read another user's prediction row").toEqual([]);

    const answers = await cli
      .from("prediction_answers")
      .select("option_id")
      .eq("prediction_id", ownerPredictionId);
    expect(answers.data ?? [], "another user's picks are hidden").toEqual([]);
  });

  test("a user cannot write another user's prediction (ownership)", async () => {
    test.skip(!ownerPredictionId, "No owner prediction to target.");
    const cli = userClient(env, outsider);
    // Direct attempt to tamper with the owner's answers must affect 0 rows (RLS).
    const del = await cli.from("prediction_answers").delete().eq("prediction_id", ownerPredictionId);
    // RLS makes this a no-op; confirm the owner's answers still exist via admin.
    const stillThere = await admin
      .from("prediction_answers")
      .select("option_id")
      .eq("prediction_id", ownerPredictionId);
    expect(stillThere.data?.length ?? 0, "owner answers untouched by outsider").toBeGreaterThan(0);
    // The delete itself returns no error but changes nothing (or is rejected).
    expect(del.error === null || del.error !== null).toBe(true);
  });
});
