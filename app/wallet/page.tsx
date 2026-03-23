"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProfileData = {
  balance_usdc: number;
};

export default function WalletPage() {
  const router = useRouter();
  const { logout } = usePrivy();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("profiles")
        .select("balance_usdc")
        .eq("id", user.id)
        .single();
      setProfile(data ?? { balance_usdc: 0 });
      setLoading(false);
    });
  }, [router]);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    await logout();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  const balance = Number(profile?.balance_usdc ?? 0);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <nav className="gla-nav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gridlock logo - transparent.png" alt="Gridlock" className="gla-nav-logo" draggable={false} />
        <div className="gla-nav-right">
          <Link className="gla-nav-link" href="/dashboard">Races</Link>
          <Link className="gla-nav-link" href="/profile">Profile</Link>
          <button className="gla-nav-link" onClick={handleSignOut}>Sign out</button>
        </div>
      </nav>

      <div className="gla-content" style={{ maxWidth: "560px" }}>
        <Link href="/profile" className="predict-back">← Profile</Link>
        <p className="gla-page-title" style={{ marginTop: "1.5rem" }}>Wallet</p>

        {/* Beta balance card */}
        <div className="wallet-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem", marginTop: "1.5rem" }}>
          <span className="wallet-balance-label">Your Beta Balance</span>
          <span className="wallet-balance">₮{balance.toFixed(2)} Test USDC</span>
        </div>

        {/* Beta disclaimer */}
        <div className="wallet-deposit-card">
          <p className="wallet-deposit-desc">
            Gridlock is in closed beta. Your balance is simulated — it&apos;s not real
            money and cannot be withdrawn. Use it to enter leagues, make predictions,
            and climb the leaderboard.
          </p>
          <p className="wallet-deposit-desc" style={{ marginTop: "0.75rem", color: "rgba(255,255,255,0.35)" }}>
            Real money features launch after beta ends.
          </p>
        </div>
      </div>
    </div>
  );
}
