import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const titillium = Titillium_Web({
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-titillium",
  display: "swap",
});

const BASE_URL = "https://joingridlock.com";

export const viewport: Viewport = {
  themeColor: "#E10600",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    // 52 chars — within the 50-60 SEO optimal range
    default: "Gridlock — F1 Prediction Game · Predict the Grid",
    template: "%s | Gridlock",
  },
  description:
    "The F1 prediction game. Predict the grid. Outsmart the crowd. Skill over consensus — always. 24 rounds, 2026 season.",
  keywords: [
    "F1 prediction game",
    "Formula 1 predictions",
    "F1 fantasy",
    "F1 2026",
    "motorsport prediction",
    "podium prediction",
    "Formula One game",
  ],
  authors: [{ name: "Gridlock", url: BASE_URL }],
  creator: "Gridlock",
  publisher: "Gridlock",

  /* ── Canonical + alternates ── */
  alternates: {
    canonical: "/",
  },

  /* ── Robots ── */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },

  /* ── Open Graph ── */
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "Gridlock",
    title: "Gridlock — F1 Prediction Game · Predict the Grid",
    description:
      "Predict the grid. Outsmart the crowd. The F1 prediction game built for people who actually watch qualifying.",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Gridlock — The F1 Prediction Game · 2026 Season",
      },
    ],
  },

  /* ── Twitter / X ── */
  twitter: {
    card: "summary_large_image",
    site: "@GridlockLeague",
    creator: "@GridlockLeague",
    title: "Gridlock — F1 Prediction Game · Predict the Grid",
    description:
      "Predict the grid. Outsmart the crowd. The F1 prediction game built for people who actually watch qualifying.",
    images: ["/opengraph-image"],
  },

  /* ── Manifest ── */
  manifest: "/manifest.webmanifest",

  /* ── Verification placeholders (fill after GSC setup) ── */
  // verification: {
  //   google: "PASTE_YOUR_GOOGLE_SITE_VERIFICATION_TOKEN_HERE",
  // },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={titillium.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
