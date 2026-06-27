import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  // Default flow is PKCE (the @supabase/ssr default), which is what Google
  // OAuth needs: signInWithOAuth() stores a code_verifier cookie that the
  // /auth/callback route reads via exchangeCodeForSession().
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
