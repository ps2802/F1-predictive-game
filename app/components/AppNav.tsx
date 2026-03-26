"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface AppNavProfile {
  username?: string | null;
  balance_usdc?: number;
  is_admin?: boolean;
}

interface AppNavProps {
  profile?: AppNavProfile | null;
}

export function AppNav({ profile }: AppNavProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const { logout } = usePrivy();

  function navLinkClass(href: string): string {
    const active = pathname === href || pathname?.startsWith(href + "/");
    return `gla-nav-link${active ? " is-active" : ""}`;
  }

  async function handleLogout(): Promise<void> {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    await logout();
    router.push("/login");
  }

  return (
    <nav className="gla-nav">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/gridlock logo - transparent.png"
        alt="Gridlock"
        className="gla-nav-logo"
        draggable={false}
      />
      <div className="gla-nav-right">
        <Link className={navLinkClass("/dashboard")} href="/dashboard">Races</Link>
        <Link className={navLinkClass("/leagues")} href="/leagues">Leagues</Link>
        <Link className={navLinkClass("/leaderboard")} href="/leaderboard">Leaderboard</Link>
        <Link className={navLinkClass("/profile")} href="/profile">
          {profile?.username ? `@${profile.username}` : "Profile"}
        </Link>
        {profile?.is_admin && (
          <Link className={navLinkClass("/admin")} href="/admin" style={{ color: "var(--gl-red)" }}>
            Admin
          </Link>
        )}
        {profile?.balance_usdc !== undefined && (
          <Link href="/wallet" className="dash-balance-pill" title="Test USDC · Not real money">
            ₮{Number(profile.balance_usdc).toFixed(2)}&nbsp;[BETA]
          </Link>
        )}
        <button className="gla-nav-link" onClick={handleLogout}>Sign out</button>
      </div>
    </nav>
  );
}
