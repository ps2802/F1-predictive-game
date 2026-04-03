import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addAddressToHeliusWebhook } from "@/lib/helius/addWebhookAddress";
import { isAdminEmail } from "@/lib/admin";

// Solana addresses are base58-encoded 32-byte public keys (32–44 chars)
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function getHeliusWatchlist(): Promise<string[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  const webhookId = process.env.HELIUS_WEBHOOK_ID;
  if (!apiKey || !webhookId) return [];
  try {
    const res = await fetch(`https://api.helius.xyz/v0/webhooks/${webhookId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const webhook = await res.json();
    return webhook.accountAddresses ?? [];
  } catch {
    return [];
  }
}

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!isAdminEmail(user.email)) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ? supabase : null;
}

/** GET /api/admin/wallets — returns Helius watchlist + user wallet addresses */
export async function GET() {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [watchlist, { data: profiles }] = await Promise.all([
    getHeliusWatchlist(),
    supabase
      .from("profiles")
      .select("id, username, wallet_address")
      .not("wallet_address", "is", null)
      .order("username"),
  ]);

  const wallets = (profiles ?? []).map((p) => ({
    userId: p.id,
    username: p.username ?? "(no username)",
    address: p.wallet_address as string,
    watched: watchlist.includes(p.wallet_address as string),
  }));

  return NextResponse.json({ watchlist, wallets });
}

/** POST /api/admin/wallets/enroll-all — adds all user wallets to Helius */
export async function POST(request: NextRequest) {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const address: string | undefined = body.address;

  if (address !== undefined && !SOLANA_ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 });
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("wallet_address")
    .not("wallet_address", "is", null);

  const addresses = address
    ? [address]
    : (profiles ?? []).map((p) => p.wallet_address as string);

  await Promise.all(addresses.map((a) => addAddressToHeliusWebhook(a)));

  return NextResponse.json({ enrolled: addresses.length });
}
