"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProfileData = {
  balance_usdc: number;
  username: string | null;
  is_admin: boolean;
};

export default function WalletPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("profiles")
        .select("balance_usdc, username, is_admin")
        .eq("id", user.id)
        .single();
      setProfile(data ?? { balance_usdc: 0, username: null, is_admin: false });
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

  const balance = Number(profile?.balance_usdc ?? 0);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={profile} />

      <div className="gla-content" style={{ maxWidth: "560px" }}>
        <Link href="/profile" className="predict-back">← Profile</Link>
        <p className="gla-page-title" style={{ marginTop: "1.5rem" }}>Wallet</p>

        {/* Beta balance card */}
        <div className="wallet-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem", marginTop: "1.5rem" }}>
          <span className="wallet-balance-label">Your Beta Balance</span>
          <span className="wallet-balance">₮{balance.toFixed(2)} Test USDC</span>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.85rem" }}>
            Prize pools, payouts, and platform fees settle in USDC.
          </span>
        </div>

        {/* Beta disclaimer */}
        <div className="wallet-deposit-card">
          <p className="wallet-beta-pill">No deposit action during beta</p>
          <p className="wallet-deposit-desc">
            Gridlock is in closed beta. Your balance is simulated — it&apos;s not real
            money and cannot be withdrawn. Use it to enter leagues, make predictions,
            and climb the leaderboard.
          </p>
          <p className="wallet-deposit-desc" style={{ marginTop: "0.75rem" }}>
            Production flow: users will be able to deposit any supported asset, Gridlock
            will swap it into USDC in the background, and the internal balance will stay
            denominated in USDC for league entry, payouts, and fee accounting.
          </p>
          <p className="wallet-deposit-desc" style={{ marginTop: "0.75rem" }}>
            Any platform fees from deposits or league entry are collected into the Gridlock
            fee wallet, while league prize pools and winner payouts remain USDC-only.
          </p>
          <p className="wallet-deposit-desc" style={{ marginTop: "0.75rem", color: "rgba(255,255,255,0.35)" }}>
            Real money features launch after beta ends.
          </p>
          <div className="wallet-action-row">
            <Link href="/leagues" className="gla-race-btn">
              Join a League
            </Link>
            <Link href="/dashboard" className="gla-race-btn league-secondary-btn">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
