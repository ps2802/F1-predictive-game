import { redirect } from "next/navigation";

export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}): Promise<never> {
  const params = await searchParams;
  const redirectTo = params.redirect;
  redirect(redirectTo ? `/?redirect=${encodeURIComponent(redirectTo)}` : "/");
}
