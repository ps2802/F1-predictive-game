import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enter the Grid",
  description:
    "Sign in or create your Gridlock account. Predict the 2026 F1 season with every race weekend that matters.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/login" },
  openGraph: {
    title: "Gridlock — Enter the Grid",
    description:
      "Sign in or create your Gridlock account. The F1 prediction game built for people who actually watch qualifying.",
    url: "https://joingridlock.com/login",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
