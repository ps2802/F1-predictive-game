"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";

type ProfileData = {
  balance_usdc: number;
  username: string | null;
  is_admin: boolean;
  wallet_address: string | null;
};

type WalletTransaction = {
  id: string;
  type: "deposit" | "entry_fee" | "edit_fee" | "withdrawal" | "payout" | "refund";
  amount: number;
  currency: string;
  description: string | null;
  created_at: string;
};

type DepositEvent = {
  id: string;
  tx_hash: string;
  token: string;
  amount: number;
  swapped_amount_usdc: number;
  credited_amount_usdc: number;
  fee_amount_usdc: number;
  confirmed: boolean;
  created_at: string;
};

type WithdrawalHold = {
  id: string;
  amount: number;
  reason: string;
  available_at: string;
  released: boolean;
  created_at: string;
};

type WalletResponse = {
  profile: ProfileData;
  ledger_currency: string;
  transactions: WalletTransaction[];
  deposits: DepositEvent[];
  withdrawalHolds: WithdrawalHold[];
  summary: {
    availableBalanceUsdc: number;
    pendingWithdrawalUsdc: number;
    depositedUsdc: number;
  };
};

function formatUsdc(amount: number): string {
  return `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTransactionLabel(type: WalletTransaction["type"]): string {
  switch (type) {
    case "entry_fee":
      return "League entry";
    case "edit_fee":
      return "Prediction edit";
    case "withdrawal":
      return "Withdrawal";
    case "payout":
      return "Payout";
    case "refund":
      return "Refund";
    default:
      return "Deposit";
  }
}

function maskHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export default function WalletPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [deposits, setDeposits] = useState<DepositEvent[]>([]);
  const [withdrawalHolds, setWithdrawalHolds] = useState<WithdrawalHold[]>([]);
  const [ledgerCurrency, setLedgerCurrency] = useState("USDC");
  const [summary, setSummary] = useState({
    availableBalanceUsdc: 0,
    pendingWithdrawalUsdc: 0,
    depositedUsdc: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      setLoading(true);
      setError("");

      const res = await fetch("/api/wallet", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as Partial<WalletResponse> & {
        error?: string;
      };

      if (cancelled) {
        return;
      }

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok || !data.profile) {
        setError(data.error ?? "Could not load your wallet right now.");
        setLoading(false);
        return;
      }

      setProfile(data.profile);
      setTransactions(data.transactions ?? []);
      setDeposits(data.deposits ?? []);
      setWithdrawalHolds(data.withdrawalHolds ?? []);
      setLedgerCurrency(data.ledger_currency ?? "USDC");
      setSummary(
        data.summary ?? {
          availableBalanceUsdc: Number(data.profile.balance_usdc ?? 0),
          pendingWithdrawalUsdc: 0,
          depositedUsdc: 0,
        }
      );
      setLoading(false);
    }

    void loadWallet();

    return () => {
      cancelled = true;
    };
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

  if (error) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav profile={profile} />
        <div className="gla-content" style={{ maxWidth: "640px", textAlign: "center", paddingTop: "6rem" }}>
          <h1 className="gla-page-title">Wallet unavailable</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.75rem" }}>{error}</p>
          <div className="wallet-action-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <button className="gla-race-btn" onClick={() => window.location.reload()}>
              Retry
            </button>
            <Link href="/dashboard" className="gla-race-btn league-secondary-btn">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const balance = Number(summary.availableBalanceUsdc ?? profile?.balance_usdc ?? 0);

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav profile={profile} />

      <div className="gla-content" style={{ maxWidth: "920px" }}>
        <Link href="/profile" className="predict-back">← Profile</Link>
        <p className="gla-page-title" style={{ marginTop: "1.5rem" }}>Wallet</p>
        <p className="gla-page-sub">Live ledger view for deposits, entries, payouts, and release holds</p>

        <div className="profile-stats-strip" style={{ marginTop: "1.5rem" }}>
          <div className="profile-stat-block">
            <span className="profile-stat-num">{formatUsdc(balance)}</span>
            <span className="profile-stat-lbl">Available {ledgerCurrency}</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat-block">
            <span className="profile-stat-num">{formatUsdc(summary.pendingWithdrawalUsdc)}</span>
            <span className="profile-stat-lbl">Pending Release</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat-block">
            <span className="profile-stat-num">{formatUsdc(summary.depositedUsdc)}</span>
            <span className="profile-stat-lbl">Deposited</span>
          </div>
        </div>

        <div className="wallet-card" style={{ marginTop: "1.5rem", alignItems: "stretch" }}>
          <div style={{ flex: 1 }}>
            <span className="wallet-balance-label">Deposit Rail Status</span>
            <span className="wallet-balance" style={{ fontSize: "1.6rem", marginTop: "0.45rem" }}>
              Manual credit flow enabled
            </span>
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", display: "block", marginTop: "0.6rem" }}>
              The backend ledger is live. Deposits are credited through the admin normalization flow and land in your internal USDC balance.
            </span>
          </div>
          <div style={{ minWidth: "280px" }}>
            <span className="wallet-balance-label">Linked Wallet</span>
            <div className="profile-field-static profile-wallet-addr" style={{ marginTop: "0.75rem" }}>
              <span className="profile-wallet-text">
                {profile?.wallet_address ?? "No embedded wallet assigned yet"}
              </span>
            </div>
          </div>
        </div>

        <div className="wallet-deposit-card">
          <p className="wallet-beta-pill">Testing mode</p>
          <p className="wallet-deposit-desc">
            Use this page to verify the actual ledger state: credits, entry fees, refunds, payouts, and any withdrawal-release holds created during settlement.
          </p>
          <p className="wallet-deposit-desc" style={{ marginTop: "0.75rem" }}>
            Manual top-ups still go through the admin route during testing, but the user-facing balance and activity feed are now reading from the real Supabase tables instead of placeholder copy.
          </p>
          <div className="wallet-action-row">
            <Link href="/leagues" className="gla-race-btn">
              Join a League
            </Link>
            <Link href="/profile" className="gla-race-btn league-secondary-btn">
              Back to Profile
            </Link>
          </div>
        </div>

        {withdrawalHolds.length > 0 && (
          <div className="profile-identity-card" style={{ marginTop: "1.5rem" }}>
            <h3 className="profile-card-title">Pending Release Holds</h3>
            <div className="lb-table" style={{ marginTop: "1rem" }}>
              <div className="lb-header" style={{ gridTemplateColumns: "160px 1fr 180px" }}>
                <span>Amount</span>
                <span>Reason</span>
                <span>Available</span>
              </div>
              {withdrawalHolds.map((hold) => (
                <div key={hold.id} className="lb-row" style={{ gridTemplateColumns: "160px 1fr 180px" }}>
                  <span className="lb-score">{formatUsdc(hold.amount)}</span>
                  <span className="lb-name">{hold.reason}</span>
                  <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>
                    {formatDateTime(hold.available_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginTop: "1.5rem" }}>
          <div className="profile-identity-card" style={{ marginTop: 0 }}>
            <h3 className="profile-card-title">Recent Ledger Activity</h3>
            {transactions.length === 0 ? (
              <p className="league-empty" style={{ marginTop: "1rem" }}>
                No wallet activity yet. Credit a balance, join a league, or settle a race to populate the ledger.
              </p>
            ) : (
              <div className="lb-table" style={{ marginTop: "1rem" }}>
                <div className="lb-header" style={{ gridTemplateColumns: "140px 1fr 140px" }}>
                  <span>Type</span>
                  <span>Description</span>
                  <span>Amount</span>
                </div>
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="lb-row" style={{ gridTemplateColumns: "140px 1fr 140px" }}>
                    <span className="lb-races">{formatTransactionLabel(transaction.type)}</span>
                    <span className="lb-name">
                      {transaction.description ?? "Ledger movement"}
                      <span className="profile-field-note" style={{ display: "block", marginTop: "0.25rem" }}>
                        {formatDateTime(transaction.created_at)}
                      </span>
                    </span>
                    <span className="lb-score">{formatUsdc(transaction.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="profile-identity-card" style={{ marginTop: 0 }}>
            <h3 className="profile-card-title">Recent Deposits</h3>
            {deposits.length === 0 ? (
              <p className="league-empty" style={{ marginTop: "1rem" }}>
                No deposit events recorded yet for this account.
              </p>
            ) : (
              <div className="lb-table" style={{ marginTop: "1rem" }}>
                <div className="lb-header" style={{ gridTemplateColumns: "1fr 110px 140px" }}>
                  <span>Reference</span>
                  <span>Status</span>
                  <span>Credited</span>
                </div>
                {deposits.map((deposit) => (
                  <div key={deposit.id} className="lb-row" style={{ gridTemplateColumns: "1fr 110px 140px" }}>
                    <span className="lb-name">
                      {maskHash(deposit.tx_hash)}
                      <span className="profile-field-note" style={{ display: "block", marginTop: "0.25rem" }}>
                        {deposit.token} {deposit.amount.toFixed(2)} · {formatDateTime(deposit.created_at)}
                      </span>
                    </span>
                    <span className="lb-races">
                      {deposit.confirmed ? "Confirmed" : "Pending"}
                    </span>
                    <span className="lb-score">{formatUsdc(deposit.credited_amount_usdc)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
