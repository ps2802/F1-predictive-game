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
    "The F1 prediction game. Predict the grid. Outsmart the crowd. Skill over consensus — always. 2026 season.",
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

  /* ── Icons ── */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32", type: "image/x-icon" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", sizes: "180x180", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico",
  },

  /* ── Manifest ── */
  manifest: "/manifest.webmanifest",

  /* ── Verification placeholders (fill after GSC setup) ── */
  // verification: {
  //   google: "PASTE_YOUR_GOOGLE_SITE_VERIFICATION_TOKEN_HERE",
  // },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: "Gridlock",
      description:
        "The F1 prediction game. Predict the grid. Outsmart the crowd. 2026 season.",
      inLanguage: "en-US",
    },
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: "Gridlock",
      url: BASE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/icon.png`,
        width: 180,
        height: 180,
      },
      sameAs: ["https://twitter.com/GridlockLeague"],
    },
    {
      "@type": "Game",
      "@id": `${BASE_URL}/#game`,
      name: "Gridlock — F1 Prediction Game",
      description:
        "Predict qualifying results and podium finishes across the 2026 Formula 1 season. Compete on a global leaderboard.",
      url: BASE_URL,
      genre: ["Sports", "Strategy", "Prediction"],
      gamePlatform: "Web Browser",
      numberOfPlayers: { "@type": "QuantitativeValue", minValue: 1 },
      publisher: { "@id": `${BASE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={titillium.variable}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
