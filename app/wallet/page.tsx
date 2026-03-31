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

type Transaction = {
  id: string;
  type: "deposit" | "entry_fee" | "edit_fee" | "payout" | "refund" | "withdrawal";
  amount: number;
  description: string | null;
  created_at: string;
};

const TX_LABELS: Record<Transaction["type"], string> = {
  deposit: "Deposit",
  entry_fee: "League Entry",
  edit_fee: "Edit Fee",
  payout: "Payout",
  refund: "Refund",
  withdrawal: "Withdrawal",
};

export default function WalletPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      const [{ data: profileData }, { data: txData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("balance_usdc, username, is_admin")
          .eq("id", user.id)
          .single(),
        supabase
          .from("transactions")
          .select("id, type, amount, description, created_at")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setProfile(profileData ?? { balance_usdc: 0, username: null, is_admin: false });
      setTransactions((txData ?? []) as Transaction[]);
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

        {/* Transaction history */}
        <div style={{ marginTop: "2rem" }}>
          <p className="gla-page-title" style={{ fontSize: "1rem", marginBottom: "1rem" }}>Recent Activity</p>
          {transactions.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.9rem" }}>No transactions yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {transactions.map((tx) => {
                const isCredit = tx.type === "payout" || tx.type === "deposit" || tx.type === "refund";
                const sign = isCredit ? "+" : "-";
                const color = isCredit ? "rgba(0,210,170,1)" : "rgba(255,255,255,0.6)";
                return (
                  <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "rgba(255,255,255,0.05)", borderRadius: "8px" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
                        {tx.type === "payout" ? "🏆 " : ""}{TX_LABELS[tx.type]}
                      </p>
                      {tx.description && (
                        <p style={{ margin: 0, color: "rgba(255,255,255,0.45)", fontSize: "0.8rem", marginTop: "0.2rem" }}>{tx.description}</p>
                      )}
                      <p style={{ margin: 0, color: "rgba(255,255,255,0.3)", fontSize: "0.75rem", marginTop: "0.2rem" }}>
                        {new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span style={{ color, fontWeight: 700, fontSize: "1rem", fontVariantNumeric: "tabular-nums" }}>
                      {sign}₮{Math.abs(tx.amount).toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
