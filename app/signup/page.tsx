/**
 * /signup — redirects to the root auth entry.
 *
 * New and returning users both go through /. Privy's modal handles the
 * distinction between first-time signups and returning logins internally.
 * This page exists only to handle legacy links.
 */
import { redirect } from "next/navigation";

type SignupPageProps = {
  searchParams?: Promise<{ redirect?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const redirectTarget = params?.redirect;

  if (!redirectTarget) {
    redirect("/");
  }

  redirect(`/?redirect=${encodeURIComponent(redirectTarget)}`);
}
