/**
 * /signup — redirects to the unified /login auth entry.
 *
 * New and returning users both go through /login. Privy's modal handles the
 * distinction between first-time signups and returning logins internally.
 * This page exists only to handle legacy links.
 */
import { redirect } from "next/navigation";

export default function SignupPage() {
  redirect("/login");
}
