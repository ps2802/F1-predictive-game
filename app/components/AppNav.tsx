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
  { href: "/wallet", label: "Wallet" },
  { href: "/profile", label: "Profile" },
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
  // Lazy import at call-site so the bundle only pulls in Privy when actually used.
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
    <button className="gla-nav-link" onClick={handleLogout}>
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
    <button className="gla-nav-link" onClick={handleLogout}>
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
  const hasPrivy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const resolvedIsAdmin = isAdmin ?? profile?.is_admin ?? false;
  const resolvedProfileLabel =
    profileLabel ?? (profile?.username ? `@${profile.username}` : null);

  const filteredItems = NAV_ITEMS.filter((item) => !item.adminOnly || resolvedIsAdmin);

  return (
    <nav className="gla-nav">
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
      <div className="gla-nav-right gla-nav-right--desktop" aria-label="Primary navigation">
        {filteredItems.map((item) => {
          const label =
            item.href === "/profile" && resolvedProfileLabel
              ? resolvedProfileLabel
              : item.label;
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
                    : item.href === "/wallet"
                      ? "nav-wallet"
                      : undefined
              }
            >
              {label}
            </Link>
          );
        })}
        {profile?.balance_usdc !== undefined && profile.balance_usdc !== null && (
          <Link
            href="/wallet"
            className="dash-balance-pill"
            title="Internal USDC ledger balance"
          >
            ${Number(profile.balance_usdc).toFixed(2)}
          </Link>
        )}
        {hasPrivy ? <PrivySignOutButton /> : <SimpleSignOutButton />}
      </div>

      {/* Hamburger button — mobile only */}
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
          {filteredItems.map((item) => {
            const label =
              item.href === "/profile" && resolvedProfileLabel
                ? resolvedProfileLabel
                : item.label;
            const active = pathname ? isActivePath(pathname, item.href) : false;

            return (
              <Link
                key={item.href}
                className={`gla-nav-mobile-link${active ? " is-active" : ""}`}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            );
          })}
          {hasPrivy ? (
            <MobilePrivySignOutButton onSignOut={() => setMenuOpen(false)} />
          ) : (
            <MobileSimpleSignOutButton onSignOut={() => setMenuOpen(false)} />
          )}
        </div>
      )}
    </nav>
  );
}
