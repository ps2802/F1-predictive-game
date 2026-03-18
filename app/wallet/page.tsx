"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function WalletPage() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const res = await fetch("/api/wallet/deposit");
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance_usdc ?? 0);
        setWalletAddress(data.wallet_address);
      }
      setLoading(false);
    });
  }, [router]);

  function copyAddress() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
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

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <nav className="gla-nav">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gridlock logo - transparent.png" alt="Gridlock" className="gla-nav-logo" draggable={false} />
        <div className="gla-nav-right">
          <Link className="gla-nav-link" href="/dashboard">Races</Link>
          <Link className="gla-nav-link" href="/profile">Profile</Link>
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

        {/* Deposit section */}
        <div className="wallet-deposit-card">
          <h3 className="wallet-deposit-title">Deposit USDC (Solana)</h3>
          <p className="wallet-deposit-desc">
            Send USDC on Solana to your deposit address. Balance updates automatically within ~60 seconds.
          </p>

          {walletAddress ? (
            <div className="wallet-address-box">
              <code className="wallet-address">{walletAddress}</code>
              <button className="league-copy-btn" onClick={copyAddress}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          ) : (
            <div className="wallet-no-address">
              <p>Wallet address not set up yet.</p>
              <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", marginTop: "0.25rem" }}>
                Wallet provisioning via Moongate will be available soon.
              </p>
            </div>
          )}

          <div className="wallet-notes">
            <p>⚠️ Only send USDC on Solana (SPL token). Other tokens will not be credited.</p>
            <p>🔒 Minimum deposit: $1.00 USDC</p>
            <p>⏱ Credits appear within 1–2 minutes after confirmation.</p>
          </div>
        </div>

        {/* Withdraw section */}
        <div className="wallet-deposit-card" style={{ marginTop: "1rem" }}>
          <h3 className="wallet-deposit-title">Withdraw</h3>
          <p className="wallet-deposit-desc">
            Withdrawals are reviewed within 24 hours for security. Minimum: $5.00 USDC.
          </p>
          <button className="gla-race-btn" style={{ opacity: 0.5, cursor: "not-allowed" }} disabled>
            Request Withdrawal (coming soon)
          </button>
        </div>
      </div>
    </div>
  );
}
