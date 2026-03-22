"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProfileData = {
  balance_usdc: number;
  wallet_address: string | null;
};

export default function WalletPage() {
  const router = useRouter();
  const { logout } = usePrivy();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase
        .from("profiles")
        .select("balance_usdc, wallet_address")
        .eq("id", user.id)
        .single();
      setProfile(data ?? { balance_usdc: 0, wallet_address: null });
      setLoading(false);
    });
  }, [router]);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    await logout();
    router.push("/login");
  }

  function handleCopy() {
    if (!profile?.wallet_address) return;
    navigator.clipboard.writeText(profile.wallet_address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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

  const address = profile?.wallet_address;
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

        {/* Solana wallet address */}
        {address ? (
          <div className="wallet-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.75rem", marginTop: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span className="wallet-balance-label">Your Solana Wallet</span>
              <span style={{ fontSize: "0.7rem", background: "rgba(232,0,45,0.15)", color: "var(--gl-red)", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600, letterSpacing: "0.04em" }}>
                DEVNET
              </span>
            </div>
            <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "rgba(255,255,255,0.7)", wordBreak: "break-all" }}>
              {address}
            </span>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                className="gla-nav-link"
                style={{ fontSize: "0.8rem", padding: 0 }}
                onClick={handleCopy}
              >
                {copied ? "Copied!" : "Copy address"}
              </button>
              <a
                href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="gla-nav-link"
                style={{ fontSize: "0.8rem" }}
              >
                View on explorer ↗
              </a>
            </div>
          </div>
        ) : (
          <div className="wallet-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem", marginTop: "1.5rem" }}>
            <span className="wallet-balance-label">Your Solana Wallet</span>
            <span style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.4)" }}>
              Wallet address syncing… refresh the page if this persists.
            </span>
          </div>
        )}

        {/* Beta Credits balance */}
        <div className="wallet-card" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.5rem", marginTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="wallet-balance-label">Beta Balance</span>
            <span style={{ fontSize: "0.7rem", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>
              SIMULATED
            </span>
          </div>
          <span className="wallet-balance">₮{balance.toFixed(2)} Beta Credits</span>
        </div>

        {/* Disclaimer */}
        <div className="wallet-deposit-card">
          <h3 className="wallet-deposit-title">About Beta Credits</h3>
          <p className="wallet-deposit-desc">
            Beta Credits are a simulated balance — not real money and cannot be
            withdrawn. Use them to enter leagues and compete on the leaderboard
            during the closed beta.
          </p>
          <p className="wallet-deposit-desc" style={{ marginTop: "0.5rem" }}>
            Your Solana wallet above is real and lives on devnet. When Gridlock
            launches on mainnet your wallet address carries over — real USDC
            entry fees and prize payouts will flow through it.
          </p>
        </div>
      </div>
    </div>
  );
}
