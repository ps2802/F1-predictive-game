import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Predictive Game",
  description: "Predict race outcomes, track points, and compete with friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
