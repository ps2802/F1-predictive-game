"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
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

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setMessage(error.message);
      setIsError(true);
      setLoading(false);
      return;
    }

    setMessage("Account created. Check your inbox to verify your email, then sign in.");
    setIsError(false);
    setLoading(false);
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
          <p className="gla-auth-eyebrow">Join the grid</p>
          <h1 className="gla-auth-title">Create account</h1>
          <p className="gla-auth-sub">Sign up to start predicting the 2026 season.</p>

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
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button className="gla-auth-btn" type="submit" disabled={loading}>
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          {message && (
            <p className={`gla-auth-msg ${isError ? "is-error" : "is-success"}`}>{message}</p>
          )}

          <div className="gla-auth-footer">
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </>
  );
}
