/** Emails (from Privy) that are permitted to access the admin dashboard. */
const ADMIN_EMAILS = [
  "praneet.sinha28@gmail.com",
  "debashritapanicker@gmail.com",
] as const;

/** Returns true only if the given email is in the admin allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes(email as (typeof ADMIN_EMAILS)[number]);
}
