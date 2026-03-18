"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams?.get("redirect") ?? null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      setMessage("Supabase env vars missing.");
      setIsError(true);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(error.message);
      setIsError(true);
      setLoading(false);
      return;
    }

    if (redirect) {
      router.push(redirect);
      return;
    }
    // Check if user needs onboarding (no username yet)
    const supabaseCheck = createSupabaseBrowserClient();
    if (supabaseCheck) {
      const { data: { user: u } } = await supabaseCheck.auth.getUser();
      if (u) {
        const { data: prof } = await supabaseCheck.from("profiles").select("username").eq("id", u.id).single();
        if (!prof?.username) { router.push("/onboarding"); return; }
      }
    }
    router.push("/dashboard");
  }

  return (
    <>
      <div className="gl-stripe" aria-hidden="true" />
      <div className="gla-auth-root">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="gla-auth-logo"
          draggable={false}
        />

        <div className="gla-auth-card">
          <p className="gla-auth-eyebrow">Driver login</p>
          <h1 className="gla-auth-title">Sign in</h1>
          <p className="gla-auth-sub">Welcome back. Enter your credentials to continue.</p>

          <form onSubmit={handleSubmit}>
            <div className="gla-field">
              <label className="gla-field-label" htmlFor="email">Email</label>
              <input
                id="email"
                className="gla-field-input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="gla-field">
              <label className="gla-field-label" htmlFor="password">Password</label>
              <input
                id="password"
                className="gla-field-input"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button className="gla-auth-btn" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {message && (
            <p className={`gla-auth-msg ${isError ? "is-error" : ""}`}>{message}</p>
          )}

          <div className="gla-auth-footer">
            New to Gridlock? <Link href="/signup">Create an account</Link>
          </div>
        </div>
      </div>
    </>
  );
}
