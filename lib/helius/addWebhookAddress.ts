/**
 * Adds a Solana wallet address to the Helius Enhanced Transaction webhook
 * so USDC deposits to that address are automatically detected.
 *
 * Called after a user's Privy wallet address is stored in their profile.
 * Silently no-ops if HELIUS_API_KEY or HELIUS_WEBHOOK_ID are not set.
 */
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
    const getRes = await fetch(
      `https://api.helius.xyz/v0/webhooks/${webhookId}`,
      { headers: heliusHeaders }
    );
    if (!getRes.ok) return;

    const webhook = await getRes.json();
    const existing: string[] = webhook.accountAddresses ?? [];

    if (existing.includes(address)) return; // already watched

    await fetch(
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
