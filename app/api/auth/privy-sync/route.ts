import { after, NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { addAddressToHeliusWebhook } from "@/lib/helius/addWebhookAddress";
import { getPrivyAppId, getPrivyAppSecret } from "@/lib/privy";
import { resolveSolanaWalletAddressFromLinkedAccounts } from "@/lib/privyOnramp";

const BETA_SIGNIN_CREDIT_USDC = Number(
  process.env.BETA_SIGNIN_CREDIT_USDC ?? 0
);
const LEGACY_BETA_CREDIT_DESCRIPTION = "Beta signup — 100 Beta Credits";
const BETA_SIGNIN_CREDIT_DESCRIPTION = `Beta sign-in credit — ${BETA_SIGNIN_CREDIT_USDC} USDC`;

function isDuplicateUserError(message?: string): boolean {
  if (!message) {
    return false;
  }

  return /already(?: been)? registered|already exists|duplicate/i.test(message);
}

function getMissingProfileColumn(message?: string): string | null {
  if (!message) {
    return null;
  }

  const match = message.match(/Could not find the '([^']+)' column of 'profiles'/i);
  return match?.[1] ?? null;
}

function buildProfilePayload(
  userId: string,
  privyUserId: string,
  walletAddress?: string
): Record<string, string | boolean> {
  return {
    id: userId,
    privy_user_id: privyUserId,
    is_beta_account: true,
    ...(walletAddress ? { wallet_address: walletAddress } : {}),
  };
}

async function upsertProfile(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  profilePayload: Record<string, string | boolean>
): Promise<{ message: string } | null> {
  const mutablePayload = { ...profilePayload };

  while (true) {
    const { error } = await admin.from("profiles").upsert(mutablePayload, {
      onConflict: "id",
    });

    if (!error) {
      return null;
    }

    const missingColumn = getMissingProfileColumn(error.message);
    if (!missingColumn || !(missingColumn in mutablePayload) || missingColumn === "id") {
      return error;
    }

    delete mutablePayload[missingColumn];
  }
}

async function ensureBetaSigninCredit(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  userId: string
) {
  if (!Number.isFinite(BETA_SIGNIN_CREDIT_USDC) || BETA_SIGNIN_CREDIT_USDC <= 0) {
    return;
  }

  const { count, error: existingCreditError } = await admin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("type", "deposit")
    .in("description", [
      LEGACY_BETA_CREDIT_DESCRIPTION,
      BETA_SIGNIN_CREDIT_DESCRIPTION,
    ]);

  if (existingCreditError) {
    console.error(
      "[Gridlock] beta sign-in credit lookup failed:",
      existingCreditError.message
    );
    return;
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("balance_usdc")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    console.error(
      "[Gridlock] beta sign-in credit profile lookup failed:",
      profileError?.message ?? "Profile not found."
    );
    return;
  }

  const nextBalance =
    Number(profile.balance_usdc ?? 0) + BETA_SIGNIN_CREDIT_USDC;

  const { error: updateBalanceError } = await admin
    .from("profiles")
    .update({ balance_usdc: nextBalance })
    .eq("id", userId);

  if (updateBalanceError) {
    console.error(
      "[Gridlock] beta sign-in credit balance update failed:",
      updateBalanceError.message
    );
    return;
  }

  const { error: transactionError } = await admin.from("transactions").insert({
    user_id: userId,
    type: "deposit",
    amount: BETA_SIGNIN_CREDIT_USDC,
    currency: "USDC",
    description: BETA_SIGNIN_CREDIT_DESCRIPTION,
  });

  if (transactionError) {
    console.error(
      "[Gridlock] beta sign-in credit transaction insert failed:",
      transactionError.message
    );
  }
}

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
  try {
    // Rate limit: 10 auth attempts per IP per 15 minutes
    const ip = getClientIp(request.headers);
    if (isRateLimited(`privy-sync:${ip}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const appId = getPrivyAppId();
    const appSecret = getPrivyAppSecret();

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

    // ── 1. Verify Privy token ─────────────────────────────────────────────
    const privy = new PrivyClient(appId, appSecret);

    let privyUserId: string;
    try {
      const claims = await privy.verifyAuthToken(accessToken);
      privyUserId = claims.userId;
    } catch {
      return NextResponse.json({ error: "Invalid Privy token." }, { status: 401 });
    }

    // ── 2. Fetch Privy user (email + embedded Solana wallet) ──────────────
    let email: string | undefined;
    let walletAddress: string | undefined;

    try {
      const privyUser = await privy.getUser(privyUserId);

      email =
        privyUser.email?.address ??
        privyUser.google?.email ??
        privyUser.apple?.email;

      walletAddress =
        resolveSolanaWalletAddressFromLinkedAccounts(
          privyUser.linkedAccounts as Array<{
            address?: string;
            chainType?: string;
            walletClientType?: string;
          }> | undefined
        ) ?? undefined;
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

    const admin = createSupabaseAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured." },
        { status: 500 }
      );
    }

    // Create the auth user before generating the magic link. Running these in
    // parallel creates an intermittent first-login race where generateLink can
    // execute before the auth user exists.
    const { data: newUserData, error: createUserError } =
      await admin.auth.admin.createUser({ email, email_confirm: true });

    if (createUserError && !isDuplicateUserError(createUserError.message)) {
      console.error("[Gridlock] privy-sync createUser failed:", createUserError.message);
      return NextResponse.json(
        { error: "Could not prepare Supabase user." },
        { status: 500 }
      );
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[Gridlock] privy-sync generateLink failed:", linkError?.message);
      return NextResponse.json(
        { error: "Could not generate Supabase session link." },
        { status: 500 }
      );
    }

    const resolvedUserId = newUserData?.user?.id ?? linkData.user?.id;
    const isNewUser = Boolean(newUserData?.user?.id);
    let hasUsername = false;

    if (resolvedUserId) {
      if (!isNewUser) {
        const { data: profileRow, error: profileReadError } = await admin
          .from("profiles")
          .select("username")
          .eq("id", resolvedUserId)
          .maybeSingle();

        if (profileReadError) {
          console.error("[Gridlock] privy-sync profile read failed:", profileReadError.message);
          return NextResponse.json(
            { error: "Could not read profile." },
            { status: 500 }
          );
        }

        hasUsername = !!profileRow?.username;
      }

      const profilePayload = buildProfilePayload(
        resolvedUserId,
        privyUserId,
        walletAddress
      );

      // Profile syncing and wallet enrichment should not block session
      // establishment. The dashboard only needs an authenticated Supabase user.
      after(async () => {
        const profileUpsertError = await upsertProfile(admin, profilePayload);
        if (profileUpsertError) {
          console.error("[Gridlock] privy-sync profile upsert failed:", profileUpsertError.message);
          return;
        }

        await ensureBetaSigninCredit(admin, resolvedUserId);

        if (walletAddress) {
          await addAddressToHeliusWebhook(walletAddress);
        }
      });
    } else if (walletAddress) {
      after(async () => {
        await addAddressToHeliusWebhook(walletAddress);
      });
    }

    return NextResponse.json({
      token: linkData.properties.hashed_token,
      email,
      hasUsername,
      privyUserId,
      userId: resolvedUserId,
    });
  } catch (error) {
    console.error("[Gridlock] privy-sync unexpected error:", error);
    return NextResponse.json(
      { error: "Unexpected auth sync failure." },
      { status: 500 }
    );
  }
}
