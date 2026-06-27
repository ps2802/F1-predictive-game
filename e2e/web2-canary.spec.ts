import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  readTestEnv,
  adminClient,
  seedUser,
  authenticateContext,
  bypassHeaders,
  type TestEnv,
  type SeededUser,
} from "./helpers/session";
import {
  findOpenRaceWithQuestions,
  findLockedRaceWithQuestions,
  findSettledRaceId,
  buildMinimalAnswers,
  buildAnyAnswer,
  type RaceQuestion,
} from "./helpers/data";

/**
 * Web2 canary — runs against a live preview/prod URL with a reachable Supabase.
 * Every journey is exercised end-to-end through the real server + database via
 * authenticated requests (session injected, no Google consent screen scripted).
 *
 * This file is intentionally OUT of the unit/vitest gate. Run it with:
 *   E2E_BASE_URL=<preview-url> npx playwright test web2-canary
 */

const env: TestEnv = (() => {
  try {
    return readTestEnv();
  } catch {
    // Surface a single skip reason rather than crashing collection when env is absent.
    return null as unknown as TestEnv;
  }
})();

test.describe.serial("Gridlock Web2 canary", () => {
  let admin: SupabaseClient;
  let userA: SeededUser;
  let userB: SeededUser;
  let ctxA: BrowserContext;
  let ctxB: BrowserContext;
  let pageA: Page;
  let openRace: { id: string; questions: RaceQuestion[] } | null = null;
  let leagueId = "";
  let inviteCode = "";

  test.beforeAll(async ({ browser }) => {
    test.skip(!env, "E2E env not configured (NEXT_PUBLIC_SUPABASE_URL / SERVICE_ROLE_KEY).");
    admin = adminClient(env);
    userA = await seedUser(env, "alpha");
    userB = await seedUser(env, "bravo");

    const extraHTTPHeaders = bypassHeaders(env);
    ctxA = await browser.newContext({ extraHTTPHeaders });
    ctxB = await browser.newContext({ extraHTTPHeaders });
    await authenticateContext(ctxA, env, userA);
    await authenticateContext(ctxB, env, userB);
    pageA = await ctxA.newPage();

    openRace = await findOpenRaceWithQuestions(admin);
  });

  test.afterAll(async () => {
    await ctxA?.close();
    await ctxB?.close();
  });

  test("dashboard loads while authed — track map present, no direct OpenF1 calls, no console errors", async () => {
    const consoleErrors: string[] = [];
    const openf1DirectCalls: string[] = [];
    pageA.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    pageA.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    pageA.on("request", (r) => {
      if (new URL(r.url()).hostname === "api.openf1.org") openf1DirectCalls.push(r.url());
    });

    const resp = await pageA.goto(`${env.baseUrl}/dashboard`, { waitUntil: "networkidle" });
    expect(resp?.status(), "dashboard HTTP status").toBeLessThan(400);
    // Authed: we must NOT be bounced to the public landing.
    expect(new URL(pageA.url()).pathname).toBe("/dashboard");
    await expect(pageA.getByTestId("nav-profile")).toBeVisible();
    await expect(pageA.locator('[aria-label="Track map"]')).toBeVisible();

    expect(openf1DirectCalls, "no direct browser calls to api.openf1.org").toEqual([]);
    expect(consoleErrors, "no console/page errors on dashboard").toEqual([]);
  });

  test("make a prediction → saved sheet lands ACTIVE (server)", async () => {
    test.skip(!openRace, "No open race with seeded questions in the live DB.");
    const answers = buildMinimalAnswers(openRace!.questions, 0);
    expect(Object.keys(answers).length, "built at least one valid answer").toBeGreaterThan(0);

    const res = await ctxA.request.post(`${env.baseUrl}/api/predictions/v2`, {
      data: { raceId: openRace!.id, answers },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("active");
  });

  test("editing before lock works (server)", async () => {
    test.skip(!openRace, "No open race with seeded questions.");
    const answers = buildMinimalAnswers(openRace!.questions, 1); // a different pick
    const res = await ctxA.request.post(`${env.baseUrl}/api/predictions/v2`, {
      data: { raceId: openRace!.id, answers },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("active");
  });

  test("a write AFTER lock is rejected by the server (403)", async () => {
    const locked = await findLockedRaceWithQuestions(admin);
    test.skip(!locked, "No locked race in the live DB yet (pre-season / nothing locked).");
    const res = await ctxA.request.post(`${env.baseUrl}/api/predictions/v2`, {
      data: { raceId: locked!.id, answers: buildAnyAnswer(locked!.questions) },
    });
    expect(res.status(), "locked race must reject writes").toBe(403);
  });

  test("create a free league (server) — no money fields", async () => {
    const res = await ctxA.request.post(`${env.baseUrl}/api/leagues`, {
      data: { name: `E2E League ${Date.now()}`, type: "private", max_users: 50 },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = await res.json();
    expect(body.league?.id).toBeTruthy();
    expect(body.league?.invite_code).toBeTruthy();
    // Money must be gone from the shape.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/entry_fee|prize_pool|stake|usdc/i);
    leagueId = body.league.id;
    inviteCode = body.league.invite_code;
  });

  test("join by invite link → second user is a member", async () => {
    expect(inviteCode, "invite code from create step").toBeTruthy();
    // The shareable invite landing renders for the joining user.
    const landing = await ctxB.newPage();
    const lr = await landing.goto(`${env.baseUrl}/join/${inviteCode}`, { waitUntil: "domcontentloaded" });
    expect(lr?.status() ?? 0).toBeLessThan(400);
    await landing.close();

    const res = await ctxB.request.post(`${env.baseUrl}/api/leagues/join`, {
      data: { invite_code: inviteCode },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test("league leaderboard renders for a member", async () => {
    expect(leagueId).toBeTruthy();
    const res = await ctxB.request.get(`${env.baseUrl}/api/leagues/${leagueId}/leaderboard`);
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length, "creator + joiner present").toBeGreaterThanOrEqual(2);

    // UI smoke: the league page renders for a member.
    const page = await ctxB.newPage();
    const r = await page.goto(`${env.baseUrl}/leagues/${leagueId}`, { waitUntil: "domcontentloaded" });
    expect(r?.status() ?? 0).toBeLessThan(400);
    await page.close();
  });

  test("a settled race is read-only (server rejects late writes)", async () => {
    const settledId = await findSettledRaceId(admin);
    test.skip(!settledId, "No settled race in the live DB yet.");
    const settledQuestions = openRace?.questions ?? [];
    // Settled races are locked → any write is rejected.
    const res = await ctxA.request.post(`${env.baseUrl}/api/predictions/v2`, {
      data: { raceId: settledId, answers: buildAnyAnswer(settledQuestions) },
    });
    expect([400, 403]).toContain(res.status()); // locked (403); 400 only if no valid question shape
    expect(res.status()).not.toBe(200);
  });
});
