"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/app/components/AppNav";
import { PrivyAddMoneyButton } from "@/app/components/PrivyAddMoneyButton";
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
      return "League Entry";
    case "edit_fee":
      return "Prediction Edit";
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

function isPositiveTransaction(type: WalletTransaction["type"]): boolean {
  return type === "deposit" || type === "payout" || type === "refund";
}

export default function WalletPageClient({
  isEmbedded = false,
}: {
  isEmbedded?: boolean;
}) {
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
        {!isEmbedded && <div className="gl-stripe" aria-hidden="true" />}
        {!isEmbedded && <AppNav profile={profile} />}
        <div
          className="gla-content"
          style={{
            maxWidth: "640px",
            textAlign: "center",
            paddingTop: isEmbedded ? "2rem" : "6rem",
          }}
        >
          <h1 className="gla-page-title">Wallet unavailable</h1>
          <p className="gla-page-sub" style={{ marginTop: "0.75rem" }}>{error}</p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "2rem" }}>
            <button className="wlt-btn-primary" onClick={() => { setError(""); setLoading(true); router.refresh(); }}>
              Retry
            </button>
            {!isEmbedded && (
              <Link href="/dashboard" className="wlt-btn-secondary">
                Back to Dashboard
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const balance = Number(summary.availableBalanceUsdc ?? profile?.balance_usdc ?? 0);
  const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const shellClassName = isEmbedded ? "wlt-shell wlt-shell-embed" : "wlt-shell";
  const contentStyle = isEmbedded
    ? { maxWidth: "100%", padding: "0 0 1.25rem" }
    : { maxWidth: "960px" };

  return (
    <div className="gla-root">
      {!isEmbedded && <div className="gl-stripe" aria-hidden="true" />}
      {!isEmbedded && <AppNav profile={profile} />}

      <div className="gla-content" style={contentStyle}>
        {!isEmbedded && <Link href="/profile" className="predict-back">← Profile</Link>}

        <div className={shellClassName}>
          {!isEmbedded && (
            <div style={{ marginTop: "1.5rem" }}>
              <h1 className="gla-page-title">Wallet</h1>
              <p className="gla-page-sub">Funding rail · deposits · payouts · release holds</p>
            </div>
          )}

          <div className="wlt-hero" data-clarity-mask="true">
            <p className="wlt-hero-eyebrow">Available Balance</p>
            <p className="wlt-hero-amount">{formatUsdc(balance)}</p>
            <p className="wlt-hero-currency">{ledgerCurrency} · Solana Network</p>

            <div className="wlt-stats-row">
              <div className="wlt-stat-block">
                <span className="wlt-stat-num">{formatUsdc(summary.pendingWithdrawalUsdc)}</span>
                <span className="wlt-stat-lbl">Pending Release</span>
              </div>
              <div className="wlt-stat-block">
                <span className="wlt-stat-num">{formatUsdc(summary.depositedUsdc)}</span>
                <span className="wlt-stat-lbl">Total Deposited</span>
              </div>
            </div>

            <div className="wlt-actions-row" style={{ marginTop: "1.5rem" }}>
              {hasPrivy && profile?.wallet_address && (
                <PrivyAddMoneyButton
                  className="wlt-btn-primary"
                  walletAddress={profile.wallet_address}
                />
              )}
              {balance > 0 && (
                <button
                  className={hasPrivy && profile?.wallet_address ? "wlt-btn-secondary" : "wlt-btn-primary"}
                  onClick={() => { setShowWithdraw(true); window.scrollTo({ top: 9999, behavior: "smooth" }); }}
                >
                  Withdraw
                </button>
              )}
              {!isEmbedded && <Link href="/leagues" className="wlt-btn-secondary">Join a League</Link>}
              {!isEmbedded && <Link href="/profile" className="wlt-btn-secondary">Profile</Link>}
            </div>
          </div>

          <div className="wlt-panel" data-clarity-mask="true">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
              <div>
                <p className="wlt-panel-eyebrow">Deposit</p>
                <p className="wlt-panel-title">Your Solana Wallet Address</p>
              </div>
              {profile?.wallet_address ? (
                <span className="wlt-status-pill">Ready to receive</span>
              ) : (
                <span className="wlt-status-pill wlt-status-pill--warn">No wallet linked</span>
              )}
            </div>

            {profile?.wallet_address ? (
              <>
                <div className="wlt-addr-box">
                  <span className="wlt-addr-text">{profile.wallet_address}</span>
                  <button
                    className={`wlt-copy-btn${addressCopied ? " copied" : ""}`}
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
                <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.4)", margin: 0, lineHeight: 1.6 }}>
                  Send USDC (SPL token on Solana) to this address. Your balance updates automatically once confirmed on-chain.
                </p>
                <div className="wlt-addr-note">
                  <span className="wlt-addr-note-icon">!</span>
                  Only send USDC on Solana. Other tokens or chains are not supported and funds may be lost.
                </div>
              </>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
                No embedded wallet linked yet. Sign out and sign back in to generate your Solana wallet, then return here to deposit.
              </p>
            )}
          </div>

          {balance > 0 && (
            <div className="wlt-panel" data-clarity-mask="true">
              <div>
                <p className="wlt-panel-eyebrow">Withdraw</p>
                <p className="wlt-panel-title">Request Withdrawal</p>
              </div>

              {!showWithdraw ? (
                <div>
                  <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.45)", margin: "0 0 1rem", lineHeight: 1.6 }}>
                    Withdrawals are processed within 24 hours. Available balance: <strong style={{ color: "#fff" }}>{formatUsdc(balance)}</strong>
                  </p>
                  <button className="wlt-btn-primary" onClick={() => setShowWithdraw(true)}>
                    Request Withdrawal
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWithdraw} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div className="wlt-form-row">
                    <label className="wlt-form-label">Destination Wallet (Solana)</label>
                    <input
                      className="league-join-input"
                      style={{ width: "100%", marginTop: "0.25rem" }}
                      placeholder="Solana wallet address"
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      data-clarity-mask="true"
                      minLength={32}
                      maxLength={44}
                      required
                    />
                  </div>
                  <div className="wlt-form-row">
                    <label className="wlt-form-label">Amount (USDC)</label>
                    <input
                      className="league-join-input"
                      style={{ width: "100%", marginTop: "0.25rem" }}
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
                  {withdrawErr && (
                    <p style={{ color: "#E10600", fontSize: "0.82rem", margin: 0 }}>{withdrawErr}</p>
                  )}
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button type="submit" className="wlt-btn-primary" disabled={withdrawing}>
                      {withdrawing ? "Processing..." : "Confirm Withdrawal"}
                    </button>
                    <button
                      type="button"
                      className="wlt-btn-secondary"
                      onClick={() => { setShowWithdraw(false); setWithdrawErr(""); }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {withdrawMsg && (
                <p style={{ color: "rgba(0,210,170,0.85)", fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>
                  {withdrawMsg}
                </p>
              )}
            </div>
          )}

          {withdrawalHolds.length > 0 && (
            <div className="wlt-panel" data-clarity-mask="true">
              <div>
                <p className="wlt-panel-eyebrow">On Hold</p>
                <p className="wlt-panel-title">Pending Release</p>
              </div>
              <div>
                {withdrawalHolds.map((hold) => (
                  <div key={hold.id} className="wlt-hold-row">
                    <span style={{ fontWeight: 700, color: "#fff" }}>{formatUsdc(hold.amount)}</span>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.82rem" }}>{hold.reason}</span>
                    <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.35)", textAlign: "right" }}>
                      Available {formatDateTime(hold.available_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="wlt-two-col">
            <div className="wlt-panel" style={{ marginTop: 0 }} data-clarity-mask="true">
              <div>
                <p className="wlt-panel-eyebrow">Activity</p>
                <p className="wlt-panel-title">Ledger</p>
              </div>
              {transactions.length === 0 ? (
                <p className="wlt-ledger-empty">
                  No activity yet. Join a league or make a deposit to get started.
                </p>
              ) : (
                <div>
                  {transactions.map((tx) => (
                    <div key={tx.id} className="wlt-tx-row">
                      <div className="wlt-tx-left">
                        <span className="wlt-tx-type">{formatTransactionLabel(tx.type)}</span>
                        <span className="wlt-tx-meta">
                          {tx.description ?? "Ledger movement"} · {formatDateTime(tx.created_at)}
                        </span>
                      </div>
                      <span className={`wlt-tx-amount ${isPositiveTransaction(tx.type) ? "positive" : "negative"}`}>
                        {isPositiveTransaction(tx.type) ? "+" : ""}{formatUsdc(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="wlt-panel" style={{ marginTop: 0 }} data-clarity-mask="true">
              <div>
                <p className="wlt-panel-eyebrow">On-chain</p>
                <p className="wlt-panel-title">Deposits</p>
              </div>
              {deposits.length === 0 ? (
                <p className="wlt-ledger-empty">
                  No deposits recorded yet for this account.
                </p>
              ) : (
                <div>
                  {deposits.map((dep) => (
                    <div key={dep.id} className="wlt-tx-row">
                      <div className="wlt-tx-left">
                        <span className="wlt-tx-type" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {maskHash(dep.tx_hash)}
                          <span className={`wlt-badge ${dep.confirmed ? "wlt-badge-teal" : "wlt-badge-amber"}`}>
                            {dep.confirmed ? "Confirmed" : "Pending"}
                          </span>
                        </span>
                        <span className="wlt-tx-meta">
                          {dep.token} {dep.amount.toFixed(2)} · {formatDateTime(dep.created_at)}
                        </span>
                      </div>
                      <span className="wlt-tx-amount positive">
                        +{formatUsdc(dep.credited_amount_usdc)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
