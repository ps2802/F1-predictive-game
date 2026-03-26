/**
 * /signup — redirects to the unified /login auth entry.
 *
 * New and returning users both go through /login. Privy's modal handles the
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
    redirect("/login?mode=signup");
  }

  const nextParams = new URLSearchParams({
    mode: "signup",
    redirect: redirectTarget,
  });

  redirect(`/login?${nextParams.toString()}`);
}
