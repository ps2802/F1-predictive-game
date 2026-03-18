import type { Metadata } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";

const titillium = Titillium_Web({
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-titillium",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gridlock",
  description:
    "The F1 prediction game. Predict the grid. Outsmart the crowd. Coming 2026.",
  openGraph: {
    title: "Gridlock",
    description: "The F1 prediction game. Coming 2026.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={titillium.variable}>
      <body>{children}</body>
    </html>
  );
}
