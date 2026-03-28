"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface AppNavProfile {
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

export function AppNav({
  profile,
  isAdmin,
  profileLabel,
}: AppNavProps): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = usePrivy();
  const resolvedIsAdmin = isAdmin ?? profile?.is_admin ?? false;
  const resolvedProfileLabel =
    profileLabel ?? (profile?.username ? `@${profile.username}` : null);

  async function handleLogout(): Promise<void> {
    const supabase = createSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    await logout();
    router.push("/login");
  }

  return (
    <nav className="gla-nav">
      <Link href="/dashboard" aria-label="Go to dashboard">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gridlock logo - transparent.png"
          alt="Gridlock"
          className="gla-nav-logo"
          draggable={false}
        />
      </Link>
      <div className="gla-nav-right" role="navigation" aria-label="Primary">
        {NAV_ITEMS.filter((item) => !item.adminOnly || resolvedIsAdmin).map((item) => {
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
        <button className="gla-nav-link" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
