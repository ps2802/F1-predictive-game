import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * proxy.ts — Route protection for authenticated pages.
 *
 * Unauthenticated users hitting protected routes are redirected to /login
 * with a ?redirect= param so they land back where they intended after auth.
 *
 * Auth routes (/login, /signup) redirect authenticated users to /dashboard
 * to avoid re-entering an active session.
 *
 * Uses @supabase/ssr to read the session from cookies without a round-trip.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/leagues",
  "/leaderboard",
  "/wallet",
  "/scores",
  "/join",
  "/onboarding",
  "/admin",
];

const AUTH_ROUTES = ["/login", "/signup"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAuthPath(pathname: string) {
  return AUTH_ROUTES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, allow all requests through. This keeps
  // preview/static environments from being hard-failed by auth middleware.
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: "implicit" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedPath(pathname) && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPath(pathname) && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - API routes
     * - Next internals and Vercel internals
     * - metadata files
     * - static assets in /public
     */
    "/((?!api|_next/static|_next/image|_vercel|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|site.webmanifest|opengraph-image|twitter-image|apple-icon|icon|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf|css|js|map|webmanifest|txt|xml)$).*)",
  ],
};
