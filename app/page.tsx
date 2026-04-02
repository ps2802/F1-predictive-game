import { redirect } from "next/navigation";
import LoginPage from "@/app/login/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  }

  return <LoginPage />;
}
