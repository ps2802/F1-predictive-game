import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * app/auth/callback — Google OAuth (PKCE) callback.
 *
 * Supabase redirects here after Google sign-in with a `?code=`. We exchange it
 * for a cookie session, then route the user: first-time users (no username yet)
 * go to /onboarding; returning users go to their intended `?next=` target or
 * /dashboard. `next` is validated to be a same-origin relative path.
 */

export const dynamic = "force-dynamic";

function sanitizeNext(next: string | null): string | null {
  return next && /^\/[^/]/.test(next) ? next : null;
}

/** Build an absolute redirect URL honoring Vercel's x-forwarded-host. */
function resolveRedirectBase(request: NextRequest): string {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  if (!isLocal && forwardedHost) {
    return `https://${forwardedHost}`;
  }
  return origin;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));
  const base = resolveRedirectBase(request);

  if (!code) {
    return NextResponse.redirect(`${base}/?error=auth_no_code`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(`${base}/?error=auth_unconfigured`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${base}/?error=auth_exchange`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${base}/?error=auth_no_user`);
  }

  // First login: the auto-created profile row has no username yet.
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const hasUsername = Boolean(profile?.username);
  const destination = hasUsername ? next ?? "/dashboard" : "/onboarding";

  return NextResponse.redirect(`${base}${destination}`);
}
