import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  // flowType: 'implicit' is required for the Privy → Supabase session bridge.
  // The bridge calls admin.generateLink() server-side and then verifyOtp() on
  // the client. With PKCE (the default in @supabase/ssr), verifyOtp() fails
  // because no PKCE code_verifier was stored by the client — it was never
  // part of a client-initiated sign-in flow. Implicit flow bypasses PKCE,
  // which is safe here because Privy handles the primary identity layer.
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: "implicit" },
  });
}
