"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance_usdc")
        .eq("id", user.id)
        .single();
      setBalance(profile?.balance_usdc ?? 0);
      setLoading(false);
    });
  }, [router]);

  if (loading) {
    return (
      <div className="gla-root">
        <div className="gla-content" style={{ textAlign: "center", paddingTop: "6rem" }}>
          <div className="gl-spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <nav className="gla-nav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gridlock logo - transparent.png" alt="Gridlock" className="gla-nav-logo" draggable={false} />
        <div className="gla-nav-right">
          <Link className="gla-nav-link" href="/dashboard">Races</Link>
          <Link className="gla-nav-link" href="/profile">Profile</Link>
          <button className="gla-nav-link" onClick={async () => {
            const supabase = createSupabaseBrowserClient();
            if (supabase) await supabase.auth.signOut();
            router.push("/login");
          }}>Sign out</button>
        </div>
      </nav>

      <div className="gla-content" style={{ maxWidth: "560px" }}>
        <Link href="/profile" className="predict-back">← Profile</Link>
        <p className="gla-page-title" style={{ marginTop: "1.5rem" }}>Balance</p>

        {/* Balance card */}
        <div className="wallet-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem", marginTop: "1.5rem" }}>
          <span className="wallet-balance-label">Available Balance</span>
          <span className="wallet-balance">${Number(balance ?? 0).toFixed(2)} USDC</span>
        </div>

        {/* Beta notice */}
        <div className="wallet-deposit-card">
          <h3 className="wallet-deposit-title">Deposits &amp; Withdrawals</h3>
          <p className="wallet-deposit-desc">
            Gridlock is currently in free beta. Paid league entry, deposits, and withdrawals will be available in a future update.
          </p>
        </div>
      </div>
    </div>
  );
}
