"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Exchange the PKCE code in the URL for a valid session before allowing password update.
  useEffect(() => {
    async function exchangeCode() {
      const code = searchParams?.get("code");
      const supabase = createSupabaseBrowserClient();
      if (!supabase) { setSessionError("Supabase env vars missing."); return; }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setSessionError("Reset link is invalid or has expired. Please request a new one."); return; }
        setSessionReady(true);
        return;
      }

      // Fallback: check if there's already a session (e.g. implicit flow hash tokens auto-handled by client)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { setSessionReady(true); return; }

      setSessionError("Reset link is invalid or has expired. Please request a new one.");
    }
    exchangeCode();
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }
    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase env vars missing.");
      setIsError(true);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      setIsError(true);
    } else {
      setIsError(false);
      setMessage("Password updated. Redirecting…");
      setTimeout(() => router.push("/dashboard"), 1500);
    }
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
          <p className="gla-auth-eyebrow">Password reset</p>
          <h1 className="gla-auth-title">Set new password</h1>

          {sessionError ? (
            <>
              <p className="gla-auth-msg is-error">{sessionError}</p>
              <div className="gla-auth-footer">
                <a href="/login">Back to sign in</a>
              </div>
            </>
          ) : !sessionReady ? (
            <div style={{ textAlign: "center", paddingTop: "2rem" }}>
              <div className="gl-spinner" />
            </div>
          ) : (
            <>
              <p className="gla-auth-sub">Choose a new password for your account.</p>
              <form onSubmit={handleSubmit}>
                <div className="gla-field">
                  <label className="gla-field-label" htmlFor="new-password">New password</label>
                  <input
                    id="new-password"
                    className="gla-field-input"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="gla-field">
                  <label className="gla-field-label" htmlFor="confirm-password">Confirm password</label>
                  <input
                    id="confirm-password"
                    className="gla-field-input"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <button className="gla-auth-btn" type="submit" disabled={loading}>
                  {loading ? "Updating…" : "Update password"}
                </button>
              </form>

              {message && (
                <p className={`gla-auth-msg ${isError ? "is-error" : ""}`}>{message}</p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
