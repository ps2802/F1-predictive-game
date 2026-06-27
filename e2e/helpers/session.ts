import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext, Cookie } from "@playwright/test";

/**
 * e2e/helpers/session.ts — Google-auth-free test authentication.
 *
 * We cannot script Google's OAuth consent screen in Playwright. Instead we seed
 * a Supabase user with the service-role key, sign it in with a password to get a
 * real session, serialize that session into the EXACT @supabase/ssr cookie
 * format (by letting the library write the cookies for us), and inject those
 * cookies into the browser context. Every test then starts already authed —
 * the app reads identity from the same cookies a real Google login would set.
 */

export interface TestEnv {
  baseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  testPassword: string;
  bypassSecret?: string;
}

export interface SeededUser {
  id: string;
  email: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[e2e] Missing required env var ${name}. Run \`vercel env pull\` (or set it) before the canary.`
    );
  }
  return value;
}

export function readTestEnv(): TestEnv {
  const baseUrl =
    process.env.E2E_BASE_URL ??
    process.env.GRIDLOCK_CANARY_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://localhost:3000";
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    testPassword: process.env.E2E_TEST_PASSWORD ?? "gridlock-e2e-Pw!2026",
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  };
}

export function adminClient(env: TestEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Seed (idempotently) a confirmed test user with a known password + username,
 * then sign in to obtain a real session. The username is set directly so the
 * user lands on the dashboard rather than onboarding.
 */
export async function seedUser(env: TestEnv, label: string): Promise<SeededUser> {
  const admin = adminClient(env);
  const email = `e2e+${label}@gridlock.test`;
  const username = `e2e_${label}`.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

  const created = await admin.auth.admin.createUser({
    email,
    password: env.testPassword,
    email_confirm: true,
  });

  let userId = created.data.user?.id ?? null;
  if (created.error && !/already.*registered|already.*exists/i.test(created.error.message)) {
    throw new Error(`[e2e] createUser(${email}) failed: ${created.error.message}`);
  }

  // Sign in (works whether the user was just created or already existed).
  const anon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await anon.auth.signInWithPassword({ email, password: env.testPassword });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`[e2e] signIn(${email}) failed: ${signIn.error?.message ?? "no session"}`);
  }
  userId = signIn.data.user?.id ?? userId;
  if (!userId) {
    throw new Error(`[e2e] could not resolve user id for ${email}`);
  }

  // Ensure the profile row exists with our username (service role bypasses RLS).
  await admin.from("profiles").upsert({ id: userId, username }, { onConflict: "id" });

  return {
    id: userId,
    email,
    username,
    accessToken: signIn.data.session.access_token,
    refreshToken: signIn.data.session.refresh_token,
  };
}

/**
 * Serialize a session into @supabase/ssr cookies by letting the library write
 * them (version-robust — no hand-crafted cookie chunking), then return them
 * shaped for Playwright's context.addCookies.
 */
export async function sessionCookies(
  env: TestEnv,
  user: SeededUser
): Promise<Cookie[]> {
  const captured: { name: string; value: string }[] = [];
  const ssr = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        for (const c of cookiesToSet) {
          captured.push({ name: c.name, value: c.value });
        }
      },
    },
  });

  await ssr.auth.setSession({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });

  if (captured.length === 0) {
    throw new Error("[e2e] @supabase/ssr did not emit any auth cookies for the session.");
  }

  const { hostname } = new URL(env.baseUrl);
  const secure = env.baseUrl.startsWith("https://");
  const expires = Math.floor(Date.now() / 1000) + 60 * 60; // 1h is plenty for a run.

  return captured.map((c) => ({
    name: c.name,
    value: c.value,
    domain: hostname,
    path: "/",
    expires,
    httpOnly: false,
    secure,
    sameSite: "Lax" as const,
  }));
}

/** Inject a seeded user's session into a browser context (start authed). */
export async function authenticateContext(
  context: BrowserContext,
  env: TestEnv,
  user: SeededUser
): Promise<void> {
  const cookies = await sessionCookies(env, user);
  await context.addCookies(cookies);
}

/** Headers to bypass Vercel preview Deployment Protection, when a token is set. */
export function bypassHeaders(env: TestEnv): Record<string, string> {
  return env.bypassSecret
    ? { "x-vercel-protection-bypass": env.bypassSecret, "x-vercel-set-bypass-cookie": "true" }
    : {};
}
