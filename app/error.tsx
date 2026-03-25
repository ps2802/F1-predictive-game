"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * app/error.tsx — App-wide error boundary for Next.js App Router.
 *
 * Catches unhandled exceptions in Server and Client Components.
 * Shows a branded Gridlock error screen instead of a blank or broken page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error monitoring service here when Sentry is added (F1P-77).
    // Do not expose raw stack traces to users.
    if (process.env.NODE_ENV === "development") {
      console.error("[Gridlock] Unhandled error:", error);
    }
  }, [error]);

  return (
    <div className="gla-root">
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: "#E10600",
        }}
        aria-hidden="true"
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.25rem",
          textAlign: "center",
          minHeight: "100svh",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          style={{ width: "120px", marginBottom: "2.5rem" }}
          draggable={false}
        />

        <p
          style={{
            fontSize: "0.6rem",
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#E10600",
            marginBottom: "1rem",
          }}
        >
          System fault
        </p>

        <h1
          style={{
            fontSize: "clamp(1.6rem, 4vw, 2.4rem)",
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: "0 0 1rem",
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            fontSize: "0.82rem",
            color: "rgba(255,255,255,0.4)",
            maxWidth: "360px",
            lineHeight: 1.6,
            marginBottom: "2rem",
          }}
        >
          An unexpected error occurred. Your predictions and progress are safe.
          {error.digest && (
            <span
              style={{
                display: "block",
                marginTop: "0.5rem",
                fontFamily: "monospace",
                fontSize: "0.7rem",
                color: "rgba(255,255,255,0.2)",
              }}
            >
              Error ID: {error.digest}
            </span>
          )}
        </p>

        <div
          style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}
        >
          <button
            onClick={reset}
            style={{
              background: "#E10600",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              border: "none",
              padding: "0.85rem 1.6rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          <Link
            href="/dashboard"
            style={{
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              fontFamily: "inherit",
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "0.85rem 1.6rem",
              display: "inline-block",
            }}
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
