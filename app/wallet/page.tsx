"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { track } from "@/lib/analytics";

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
  const [addressCopied, setAddressCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState("");
  const [withdrawErr, setWithdrawErr] = useState("");

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
        router.push("/");
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

  useEffect(() => {
    if (!loading && !error) {
      track("wallet_viewed", {
        deposit_count: deposits.length,
        transaction_count: transactions.length,
        withdrawal_hold_count: withdrawalHolds.length,
      });
    }
  }, [deposits.length, error, loading, transactions.length, withdrawalHolds.length]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setWithdrawing(true);
    setWithdrawErr("");
    setWithdrawMsg("");
    track("withdrawal_started", {
      amount_usdc: Number(withdrawAmount),
    });
    const res = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_usdc: Number(withdrawAmount),
        destination_address: withdrawAddress.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      track("withdrawal_failed", {
        amount_usdc: Number(withdrawAmount),
        error_category: res.status,
      });
      setWithdrawErr(data.error ?? "Withdrawal failed.");
    } else {
      track(
        "withdrawal_requested",
        {
          amount_usdc: Number(withdrawAmount),
        },
        { send_to_posthog: false, send_to_clarity: true }
      );
      setWithdrawMsg(`Withdrawal of $${Number(withdrawAmount).toFixed(2)} queued. Admin review within 24 hours.`);
      setWithdrawAmount("");
      setWithdrawAddress("");
      setShowWithdraw(false);
      // Reload wallet data without full page reload
      router.refresh();
    }
    setWithdrawing(false);
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

  if (error) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav profile={profile} />
        <div className="gla-content" style={{ maxWidth: "640px", textAlign: "center", paddingTop: "6rem" }}>
          <h1 className="gla-page-title">Wallet unavailable</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.75rem" }}>{error}</p>
          <div className="wallet-action-row" style={{ justifyContent: "center", marginTop: "2rem" }}>
            <button className="gla-race-btn" onClick={() => { setError(""); setLoading(true); router.refresh(); }}>
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

        <div className="profile-stats-strip" style={{ marginTop: "1.5rem" }} data-clarity-mask="true">
          <div className="profile-stat-block">
            <span className="profile-stat-num" data-testid="wallet-balance">
              {formatUsdc(balance)}
            </span>
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

        <div className="wallet-card" style={{ marginTop: "1.5rem", alignItems: "stretch" }} data-clarity-mask="true">
          <div style={{ flex: 1 }}>
            <span className="wallet-balance-label">Deposit Status</span>
            <span className="wallet-balance" style={{ fontSize: "1.6rem", marginTop: "0.45rem" }}>
              Ready to receive
            </span>
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.85rem", display: "block", marginTop: "0.6rem" }}>
              Send USDC to your linked wallet address below. Your balance will update once the transaction is confirmed.
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

        <div className="wallet-deposit-card" data-clarity-mask="true">
          <p className="wallet-deposit-title">Deposit USDC</p>
          {profile?.wallet_address ? (
            <>
              <p className="wallet-deposit-desc">
                Send USDC (SPL token on Solana) to your embedded wallet. Your balance updates automatically once confirmed on-chain.
              </p>
              <div className="wallet-address-box">
                <span className="wallet-address-text">{profile.wallet_address}</span>
                <button
                  className="league-copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(profile.wallet_address!).then(() => {
                      setAddressCopied(true);
                      setTimeout(() => setAddressCopied(false), 2000);
                    });
                  }}
                >
                  {addressCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="wallet-deposit-note">
                Only send USDC on Solana. Other tokens or chains are not supported.
              </p>
            </>
          ) : (
            <p className="wallet-deposit-desc">
              No embedded wallet linked yet. Sign out and sign back in to generate your Solana wallet, then return here to deposit.
            </p>
          )}
          <div className="wallet-action-row" style={{ marginTop: "1rem" }}>
            <Link href="/leagues" className="gla-race-btn">Join a League</Link>
            <Link href="/profile" className="gla-race-btn league-secondary-btn">Back to Profile</Link>
          </div>
        </div>

        {/* Withdrawal */}
        {balance > 0 && (
          <div className="wallet-deposit-card" style={{ marginTop: "1.5rem" }} data-clarity-mask="true">
            <p className="wallet-deposit-title">Withdraw USDC</p>
            {!showWithdraw ? (
              <>
                <p className="wallet-deposit-desc">
                  Withdrawals are processed within 24 hours. Your available balance is {formatUsdc(balance)}.
                </p>
                <button
                  className="gla-race-btn"
                  style={{ marginTop: "0.75rem" }}
                  onClick={() => setShowWithdraw(true)}
                >
                  Request Withdrawal
                </button>
              </>
            ) : (
              <form onSubmit={handleWithdraw} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
                <div>
                  <label className="wallet-deposit-title">Destination Wallet (Solana)</label>
                  <input
                    className="league-join-input"
                    style={{ width: "100%", marginTop: "0.35rem" }}
                    placeholder="Solana wallet address"
                    value={withdrawAddress}
                    onChange={(e) => setWithdrawAddress(e.target.value)}
                    data-clarity-mask="true"
                    minLength={32}
                    maxLength={44}
                    required
                  />
                </div>
                <div>
                  <label className="wallet-deposit-title">Amount (USDC)</label>
                  <input
                    className="league-join-input"
                    style={{ width: "100%", marginTop: "0.35rem" }}
                    type="number"
                    placeholder={`Max ${balance.toFixed(2)}`}
                    min="1"
                    max={balance}
                    step="0.01"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    required
                  />
                </div>
                {withdrawErr && <p style={{ color: "#E10600", fontSize: "0.85rem" }}>{withdrawErr}</p>}
                <div className="wallet-action-row">
                  <button type="submit" className="gla-race-btn" disabled={withdrawing}>
                    {withdrawing ? "Processing..." : "Confirm Withdrawal"}
                  </button>
                  <button
                    type="button"
                    className="gla-race-btn league-secondary-btn"
                    onClick={() => { setShowWithdraw(false); setWithdrawErr(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {withdrawMsg && <p style={{ color: "rgba(0,210,170,0.9)", fontSize: "0.85rem", marginTop: "0.75rem" }}>{withdrawMsg}</p>}
          </div>
        )}

        {withdrawalHolds.length > 0 && (
          <div className="profile-identity-card" style={{ marginTop: "1.5rem" }} data-clarity-mask="true">
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
          <div className="profile-identity-card" style={{ marginTop: 0 }} data-clarity-mask="true">
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

          <div className="profile-identity-card" style={{ marginTop: 0 }} data-clarity-mask="true">
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
