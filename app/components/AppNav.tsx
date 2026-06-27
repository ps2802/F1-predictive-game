"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { resetAnalytics } from "@/lib/analytics";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface AppNavProfile {
  username?: string | null;
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

async function signOut(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  resetAnalytics();
}

function SignOutButton(): React.JSX.Element {
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    await signOut();
    router.push("/");
  }

  return (
    <button className="gla-nav-signout" onClick={handleLogout}>
      Sign out
    </button>
  );
}

function DrawerSignOutButton({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const router = useRouter();

  async function handleLogout(): Promise<void> {
    onSignOut();
    await signOut();
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
  const resolvedIsAdmin = isAdmin ?? profile?.is_admin ?? false;
  const resolvedProfileLabel =
    profileLabel ?? (profile?.username ? `@${profile.username}` : null);
  const showUtilityDivider = resolvedIsAdmin || Boolean(resolvedProfileLabel);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;

    if (menuOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menuOpen]);

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
              {resolvedProfileLabel && (
                <Link
                  href="/profile"
                  className={`gla-nav-user${pathname && isActivePath(pathname, "/profile") ? " is-active" : ""}`}
                  title="View profile"
                  data-testid="nav-profile"
                >
                  <span className="gla-nav-username">{resolvedProfileLabel}</span>
                </Link>
              )}
              {showUtilityDivider && <span className="gla-nav-divider" aria-hidden="true" />}
              <SignOutButton />
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
                {resolvedProfileLabel && (
                  <Link
                    href="/profile"
                    className="gla-nav-mobile-account"
                    title="View profile"
                    data-testid="nav-profile-mobile"
                  >
                    <span className="gla-nav-mobile-account-label">Profile</span>
                    <span className="gla-nav-mobile-account-value">{resolvedProfileLabel}</span>
                  </Link>
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
              {resolvedProfileLabel && (
                <Link
                  href="/profile"
                  className={`gla-nav-drawer-action${pathname && isActivePath(pathname, "/profile") ? " is-active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  Profile
                </Link>
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
              <DrawerSignOutButton onSignOut={() => setMenuOpen(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
