"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Handles invite links: /join/ABCD1234
export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params?.code as string ?? "").toUpperCase();
  const [status, setStatus] = useState<"loading" | "joining" | "done" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        // Save code and redirect to login
        router.push(`/login?redirect=/join/${code}`);
        return;
      }

      setStatus("joining");
      const res = await fetch("/api/leagues/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus("done");
        setMessage("Joined! Redirecting to league...");
        setTimeout(() => router.push(`/leagues/${data.leagueId}`), 1500);
      } else if (res.status === 409) {
        // Already a member
        const { data: league } = await supabase
          .from("leagues")
          .select("id")
          .eq("invite_code", code)
          .single();
        router.push(league ? `/leagues/${league.id}` : "/leagues");
      } else {
        setStatus("error");
        setMessage(data.error ?? "Invalid invite code.");
      }
    });
  }, [code, router]);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
        {status === "loading" || status === "joining" ? (
          <>
            <div className="gl-spinner" />
            <p style={{ color: "rgba(255,255,255,0.5)", marginTop: "1rem" }}>
              {status === "joining" ? "Joining league..." : "Checking invite..."}
            </p>
          </>
        ) : status === "done" ? (
          <p style={{ color: "#4caf50" }}>{message}</p>
        ) : (
          <p style={{ color: "var(--gl-red)" }}>{message}</p>
        )}
      </div>
    </div>
  );
}
