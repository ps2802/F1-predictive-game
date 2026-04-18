"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Races" },
  { href: "/leagues", label: "Leagues" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

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

function MobilePrivySignOutButton({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
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
    <button className="gla-nav-mobile-link" onClick={handleLogout}>
      Sign out
    </button>
  );
}

function MobileSimpleSignOutButton({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
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
    <button className="gla-nav-mobile-link" onClick={handleLogout}>
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
  const resolvedProfileLabel =
    profileLabel ?? (profile?.username ? `@${profile.username}` : null);

  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || resolvedIsAdmin);
  const hasBalance = profile?.balance_usdc !== undefined && profile.balance_usdc !== null;

  return (
    <>
      <nav className="gla-nav">
        {/* Left: Logo */}
        <Link href="/dashboard" aria-label="Go to dashboard">
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

        {/* Center: Primary nav — desktop only */}
        <div className="gla-nav-center" aria-label="Primary navigation">
          {navItems.map((item) => {
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

        {/* Right: Utility area — desktop only */}
        <div className="gla-nav-utility">
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
                  ${Number(profile!.balance_usdc).toFixed(2)}
                </span>
              )}
            </button>
          )}
          <span className="gla-nav-divider" aria-hidden="true" />
          {hasPrivy ? <PrivySignOutButton /> : <SimpleSignOutButton />}
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="gla-nav-hamburger"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="gla-nav-mobile-menu" role="dialog" aria-label="Navigation menu">
            {navItems.map((item) => {
              const active = pathname ? isActivePath(pathname, item.href) : false;
              return (
                <Link
                  key={item.href}
                  className={`gla-nav-mobile-link${active ? " is-active" : ""}`}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            {resolvedProfileLabel && (
              <button
                type="button"
                className="gla-nav-mobile-link"
                onClick={() => {
                  setMenuOpen(false);
                  setWalletOpen(true);
                }}
              >
                {resolvedProfileLabel}
                {hasBalance && ` · $${Number(profile!.balance_usdc).toFixed(2)}`}
              </button>
            )}
            {hasPrivy ? (
              <MobilePrivySignOutButton onSignOut={() => setMenuOpen(false)} />
            ) : (
              <MobileSimpleSignOutButton onSignOut={() => setMenuOpen(false)} />
            )}
          </div>
        )}
      </nav>

      {/* Wallet drawer overlay */}
      {walletOpen && (
        <>
          <div
            className="gla-wallet-overlay"
            onClick={() => setWalletOpen(false)}
            aria-hidden="true"
          />
          <div className="gla-wallet-drawer" role="dialog" aria-label="Wallet">
            <button
              type="button"
              className="gla-wallet-drawer-close"
              onClick={() => setWalletOpen(false)}
              aria-label="Close wallet"
            >
              ✕
            </button>
            <iframe
              src="/wallet?embed=1"
              className="gla-wallet-iframe"
              title="Wallet"
              loading="lazy"
            />
          </div>
        </>
      )}
    </>
  );
}
