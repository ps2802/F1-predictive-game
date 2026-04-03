/**
 * Adds a Solana wallet address to the Helius Enhanced Transaction webhook
 * so USDC deposits to that address are automatically detected.
 *
 * Called after a user's Privy wallet address is stored in their profile.
 * Silently no-ops if HELIUS_API_KEY or HELIUS_WEBHOOK_ID are not set.
 */
// 3-second budget: Helius must not block the auth response.
const HELIUS_TIMEOUT_MS = 3000;

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HELIUS_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

export async function addAddressToHeliusWebhook(address: string): Promise<void> {
  const apiKey = process.env.HELIUS_API_KEY;
  const webhookId = process.env.HELIUS_WEBHOOK_ID;

  if (!apiKey || !webhookId) return;

  const heliusHeaders = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };

  try {
    // Fetch current webhook config to get existing address list
    const getRes = await fetchWithTimeout(
      `https://api.helius.xyz/v0/webhooks/${webhookId}`,
      { headers: heliusHeaders }
    );
    if (!getRes.ok) return;

    const webhook = await getRes.json();
    const existing: string[] = webhook.accountAddresses ?? [];

    if (existing.includes(address)) return; // already watched

    await fetchWithTimeout(
      `https://api.helius.xyz/v0/webhooks/${webhookId}`,
      {
        method: "PUT",
        headers: heliusHeaders,
        body: JSON.stringify({
          ...webhook,
          accountAddresses: [...existing, address],
        }),
      }
    );
  } catch {
    // Non-fatal: admin can manually add addresses in Helius dashboard
  }
}
