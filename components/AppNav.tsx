"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AppNavProps = {
  isAdmin?: boolean;
  profileLabel?: string | null;
};

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

export function AppNav({ isAdmin = false, profileLabel }: AppNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = usePrivy();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
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
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const label =
            item.href === "/profile" && profileLabel ? profileLabel : item.label;
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

        <button className="gla-nav-link" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
