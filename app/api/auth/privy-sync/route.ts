import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/auth/privy-sync
 *
 * Called from the client immediately after a successful Privy login.
 * Responsibilities:
 *   1. Verify the Privy access token (server-side, using PRIVY_APP_SECRET).
 *   2. Fetch the Privy user to extract email + embedded Solana wallet address.
 *   3. Find or create the corresponding Supabase auth user (matched by email).
 *   4. Upsert the profile row: privy_user_id, wallet_address, beta flag.
 *   5. Generate a Supabase magic-link OTP and return it to the client so the
 *      browser can establish a Supabase session — keeping all existing API
 *      routes (which use supabase.auth.getUser()) working without any changes.
 *
 * The client calls supabase.auth.verifyOtp({ email, token, type: 'email' })
 * with the returned values to complete the session handshake.
 */
export async function POST(request: NextRequest) {
  // Rate limit: 10 auth attempts per IP per 15 minutes
  const ip = getClientIp(request.headers);
  if (isRateLimited(`privy-sync:${ip}`, 10, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before trying again." },
      { status: 429 }
    );
  }

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Privy env vars not configured." },
      { status: 500 }
    );
  }

  let body: { accessToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { accessToken } = body;
  if (!accessToken) {
    return NextResponse.json({ error: "accessToken is required." }, { status: 400 });
  }

  // ── 1. Verify Privy token ───────────────────────────────────────────────
  const privy = new PrivyClient(appId, appSecret);

  let privyUserId: string;
  try {
    const claims = await privy.verifyAuthToken(accessToken);
    privyUserId = claims.userId;
  } catch {
    return NextResponse.json({ error: "Invalid Privy token." }, { status: 401 });
  }

  // ── 2. Fetch Privy user (email + embedded Solana wallet) ────────────────
  let email: string | undefined;
  let walletAddress: string | undefined;

  try {
    const privyUser = await privy.getUser(privyUserId);

    // Email — available for email, Google, and Apple logins (Apple relays an
    // anonymised address for users who chose "Hide My Email", which still works).
    email = privyUser.email?.address
      ?? privyUser.google?.email
      ?? privyUser.apple?.email;

    // Embedded Solana wallet created by Privy on login.
    const solanaWallet = privyUser.linkedAccounts?.find(
      (a) => a.type === "wallet" && a.chainType === "solana" && a.walletClientType === "privy"
    );
    if (solanaWallet && "address" in solanaWallet) {
      walletAddress = solanaWallet.address as string;
    }
  } catch {
    return NextResponse.json(
      { error: "Could not fetch Privy user." },
      { status: 502 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { error: "No email address found on Privy account." },
      { status: 422 }
    );
  }

  // ── 3 + 5. Find/create Supabase user AND generate OTP in parallel ──────
  // createUser is fire-and-forget for new users (fires handle_new_user trigger).
  // generateLink works whether or not the user exists and returns the user ID.
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured." },
      { status: 500 }
    );
  }

  const [{ data: newUserData }, { data: linkData, error: linkError }] =
    await Promise.all([
      admin.auth.admin.createUser({ email, email_confirm: true }),
      admin.auth.admin.generateLink({ type: "magiclink", email }),
    ]);

  if (linkError || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: "Could not generate Supabase session link." },
      { status: 500 }
    );
  }

  // Resolve the Supabase user ID (prefer createUser response; fall back to
  // generateLink which also returns the user for existing accounts).
  const resolvedUserId = newUserData?.user?.id ?? linkData.user?.id;

  // ── 4. Upsert profile + check username in parallel ──────────────────────
  // Check for existing username at the same time as writing privy/wallet fields
  // so the client doesn't need a separate round-trip to decide where to redirect.
  let hasUsername = false;

  if (resolvedUserId) {
    const [, { data: profileRow }] = await Promise.all([
      admin.from("profiles").upsert(
        {
          id: resolvedUserId,
          privy_user_id: privyUserId,
          ...(walletAddress ? { wallet_address: walletAddress } : {}),
          is_beta_account: true,
        },
        { onConflict: "id" }
      ),
      admin.from("profiles").select("username").eq("id", resolvedUserId).single(),
    ]);
    hasUsername = !!profileRow?.username;
  }

  return NextResponse.json({
    token: linkData.properties.hashed_token,
    email,
    hasUsername,
  });
}
