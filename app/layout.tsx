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
  title: "Gridlock — The F1 Prediction Game",
  description:
    "Predict the grid. Compete against rivals. The skill-based F1 prediction platform coming in 2026.",
  openGraph: {
    title: "Gridlock — The F1 Prediction Game",
    description: "Predict the grid. Compete against rivals.",
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
