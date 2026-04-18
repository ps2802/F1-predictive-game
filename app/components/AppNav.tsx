"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { resetAnalytics } from "@/lib/analytics";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface AppNavProfile {
  username?: string | null;
  balance_usdc?: number | null;
  is_admin?: boolean | null;
}

export interface AppNavProps {
  profile?: AppNavProfile | null;
  isAdmin?: boolean;
  profileLabel?: string | null;
}

type NavItem = {
  href: string;
  label: string;
};

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Races" },
  { href: "/leagues", label: "Leagues" },
  { href: "/leaderboard", label: "Leaderboard" },
];

const ADMIN_NAV_ITEM: NavItem = { href: "/admin", label: "Admin" };

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/predict/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Only rendered when NEXT_PUBLIC_PRIVY_APP_ID is set — safe to call usePrivy() here.
function PrivySignOutButton(): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { usePrivy } = require("@privy-io/react-auth") as {
    usePrivy: () => { logout: () => Promise<void> };
  };
  const { logout } = usePrivy();
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    await logout();
    resetAnalytics();
    router.push("/");
  }

  return (
    <button className="gla-nav-signout" onClick={handleLogout}>
      Sign out
    </button>
  );
}

function SimpleSignOutButton(): React.JSX.Element {
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    resetAnalytics();
    router.push("/");
  }

  return (
    <button className="gla-nav-signout" onClick={handleLogout}>
      Sign out
    </button>
  );
}

function DrawerPrivySignOutButton({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { usePrivy } = require("@privy-io/react-auth") as {
    usePrivy: () => { logout: () => Promise<void> };
  };
  const { logout } = usePrivy();
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    onSignOut();
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    await logout();
    resetAnalytics();
    router.push("/");
  }

  return (
    <button className="gla-nav-drawer-action gla-nav-drawer-action-signout" onClick={handleLogout}>
      Sign out
    </button>
  );
}

function DrawerSimpleSignOutButton({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    onSignOut();
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    resetAnalytics();
    router.push("/");
  }

  return (
    <button className="gla-nav-drawer-action gla-nav-drawer-action-signout" onClick={handleLogout}>
      Sign out
    </button>
  );
}

export function AppNav({
  profile,
  isAdmin,
  profileLabel,
}: AppNavProps): React.JSX.Element {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const resolvedIsAdmin = isAdmin ?? profile?.is_admin ?? false;
  const hasBalance = profile?.balance_usdc !== undefined && profile.balance_usdc !== null;
  const resolvedProfileLabel =
    profileLabel ?? (profile?.username ? `@${profile.username}` : null);
  const resolvedBalanceLabel = hasBalance ? `$${Number(profile!.balance_usdc).toFixed(2)}` : null;
  const showUtilityDivider = resolvedIsAdmin || Boolean(resolvedProfileLabel) || hasBalance;
  const showMobileAccount = Boolean(resolvedProfileLabel) || hasBalance;
  const mobileAccountValue = resolvedBalanceLabel ?? resolvedProfileLabel ?? "Account";
  const mobileAccountLabel = hasBalance ? "Wallet" : "Profile";

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;

    if (menuOpen || walletOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menuOpen, walletOpen]);

  return (
    <>
      <nav className="gla-nav">
        <div className="gla-nav-shell">
          <div className="gla-nav-desktop">
            <div className="gla-nav-primary">
              <Link href="/dashboard" aria-label="Go to dashboard" className="gla-nav-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/gridlock logo - transparent.png"
                  alt="Gridlock"
                  className="gla-nav-logo"
                  width={130}
                  height={36}
                  draggable={false}
                />
              </Link>

              <div className="gla-nav-center" aria-label="Primary navigation">
                {PRIMARY_NAV_ITEMS.map((item) => {
                  const active = pathname ? isActivePath(pathname, item.href) : false;
                  return (
                    <Link
                      key={item.href}
                      className={`gla-nav-link${active ? " is-active" : ""}`}
                      href={item.href}
                      data-testid={
                        item.href === "/dashboard"
                          ? "nav-dashboard"
                          : item.href === "/leagues"
                            ? "nav-leagues"
                            : undefined
                      }
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="gla-nav-utility">
              {resolvedIsAdmin && (
                <Link
                  href={ADMIN_NAV_ITEM.href}
                  className={`gla-nav-link gla-nav-link-utility${pathname && isActivePath(pathname, ADMIN_NAV_ITEM.href) ? " is-active" : ""}`}
                  data-testid="nav-admin"
                >
                  {ADMIN_NAV_ITEM.label}
                </Link>
              )}
              {(resolvedProfileLabel || hasBalance) && (
                <button
                  type="button"
                  className="gla-nav-user"
                  onClick={() => setWalletOpen(true)}
                  title="Open wallet"
                  data-testid="nav-wallet"
                >
                  {resolvedProfileLabel && (
                    <span className="gla-nav-username">{resolvedProfileLabel}</span>
                  )}
                  {hasBalance && (
                    <span className="gla-nav-balance">
                      {resolvedBalanceLabel}
                    </span>
                  )}
                </button>
              )}
              {showUtilityDivider && <span className="gla-nav-divider" aria-hidden="true" />}
              {hasPrivy ? <PrivySignOutButton /> : <SimpleSignOutButton />}
            </div>
          </div>

          <div className="gla-nav-mobile">
            <div className="gla-nav-mobile-top">
              <Link href="/dashboard" aria-label="Go to dashboard" className="gla-nav-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/gridlock logo - transparent.png"
                  alt="Gridlock"
                  className="gla-nav-logo"
                  width={130}
                  height={36}
                  draggable={false}
                />
              </Link>

              <div className="gla-nav-mobile-tools">
                {showMobileAccount && (
                  <button
                    type="button"
                    className="gla-nav-mobile-account"
                    onClick={() => setWalletOpen(true)}
                    title="Open wallet"
                    data-testid="nav-wallet-mobile"
                  >
                    <span className="gla-nav-mobile-account-label">{mobileAccountLabel}</span>
                    <span className="gla-nav-mobile-account-value">{mobileAccountValue}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="gla-nav-hamburger"
                  aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((prev) => !prev)}
                >
                  <span />
                  <span />
                  <span />
                </button>
              </div>
            </div>

            <div className="gla-nav-mobile-tabs" aria-label="Primary navigation">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const active = pathname ? isActivePath(pathname, item.href) : false;
                return (
                  <Link
                    key={item.href}
                    className={`gla-nav-mobile-tab${active ? " is-active" : ""}`}
                    href={item.href}
                    data-testid={
                      item.href === "/dashboard"
                        ? "nav-dashboard-mobile"
                        : item.href === "/leagues"
                          ? "nav-leagues-mobile"
                          : undefined
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <>
          <div
            className="gla-nav-drawer-overlay"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            className="gla-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gla-nav-drawer-title"
          >
            <div className="gla-nav-drawer-head">
              <div>
                <p className="gla-nav-drawer-eyebrow">Menu</p>
                <h2 className="gla-nav-drawer-title" id="gla-nav-drawer-title">
                  Gridlock
                </h2>
                <p className="gla-nav-drawer-meta">
                  {resolvedProfileLabel ?? "Race control"}
                  {resolvedBalanceLabel ? ` · ${resolvedBalanceLabel}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="gla-nav-drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                Close
              </button>
            </div>

            <div className="gla-nav-drawer-body">
              {showMobileAccount && (
                <button
                  type="button"
                  className="gla-nav-drawer-action"
                  onClick={() => {
                    setMenuOpen(false);
                    setWalletOpen(true);
                  }}
                >
                  Open wallet
                </button>
              )}
              {resolvedIsAdmin && (
                <Link
                  href={ADMIN_NAV_ITEM.href}
                  className={`gla-nav-drawer-action${pathname && isActivePath(pathname, ADMIN_NAV_ITEM.href) ? " is-active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {ADMIN_NAV_ITEM.label}
                </Link>
              )}
              {hasPrivy ? (
                <DrawerPrivySignOutButton onSignOut={() => setMenuOpen(false)} />
              ) : (
                <DrawerSimpleSignOutButton onSignOut={() => setMenuOpen(false)} />
              )}
            </div>
          </div>
        </>
      )}

      {/* Wallet drawer overlay */}
      {walletOpen && (
        <>
          <div
            className="gla-wallet-overlay"
            onClick={() => setWalletOpen(false)}
            aria-hidden="true"
          />
          <div
            className="gla-wallet-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gla-wallet-drawer-title"
          >
            <div className="gla-wallet-drawer-head">
              <div className="gla-wallet-drawer-copy">
                <p className="gla-wallet-drawer-eyebrow">Wallet Rail</p>
                <h2 className="gla-wallet-drawer-title" id="gla-wallet-drawer-title">
                  USDC Ledger
                </h2>
                <p className="gla-wallet-drawer-meta">
                  {resolvedProfileLabel ?? "Gridlock account"}
                  {resolvedBalanceLabel
                    ? ` · ${resolvedBalanceLabel} available`
                    : " · Funding, deposits, and withdrawals"}
                </p>
              </div>
              <button
                type="button"
                className="gla-wallet-drawer-close"
                onClick={() => setWalletOpen(false)}
                aria-label="Close wallet"
              >
                Close
              </button>
            </div>
            <div className="gla-wallet-drawer-body">
              <iframe
                src="/wallet?embed=1"
                className="gla-wallet-iframe"
                title="Wallet"
                loading="lazy"
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
