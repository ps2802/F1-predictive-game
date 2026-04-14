import type { Metadata, Viewport } from "next";
import { Titillium_Web } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
    // 55 chars — within the 50-60 SEO optimal range
    default: "Gridlock — Free F1 Prediction Game · Win Prizes 2026",
    template: "%s | Gridlock",
  },
  description:
    "Gridlock is the free F1 prediction game for the 2026 Formula 1 season. Predict podium finishes, earn points, win prizes. Compete globally — skill over luck.",
  keywords: [
    "F1 prediction game",
    "Formula 1 prediction game",
    "F1 predictions 2026",
    "Formula 1 predictions",
    "F1 fantasy alternative",
    "F1 game earn money",
    "earn money Formula 1",
    "win prizes F1",
    "win money F1 game",
    "F1 2026 season game",
    "gridlock F1",
    "gridlock prediction game",
    "F1 podium prediction",
    "predict Formula 1 podium",
    "predict Formula 1 winner",
    "f1 podium predictor",
    "f1 race predictor",
    "motorsport prediction game",
    "F1 prediction app",
    "Formula One game",
    "F1 fantasy game",
    "best F1 prediction game",
    "F1 prediction league",
    "f1 private league game",
    "Formula 1 2026 game",
    "f1 leaderboard game",
    "f1 prize competition",
    "predict grand prix podium",
    "formula 1 prediction contest",
    "joingridlock",
    "joingridlock.com",
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
    title: "Gridlock — Free F1 Prediction Game · Win Prizes 2026",
    description:
      "Free F1 prediction game for the 2026 season. Predict podium finishes, earn points, win prizes. Outsmart the crowd — skill over luck.",
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
    title: "Gridlock — Free F1 Prediction Game · Win Prizes 2026",
    description:
      "Free F1 prediction game for 2026. Predict podiums, earn points, win prizes. 24 races. 20 drivers. Starts now.",
    images: ["/opengraph-image"],
  },

  /* ── Icons ── */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32", type: "image/x-icon" },
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
        "Predict podium finishes across the 2026 Formula 1 season. Compete on a global leaderboard and earn prizes.",
      url: BASE_URL,
      genre: ["Sports", "Strategy", "Prediction"],
      gamePlatform: ["Web Browser", "Mobile Browser"],
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      numberOfPlayers: { "@type": "QuantitativeValue", minValue: 1 },
      publisher: { "@id": `${BASE_URL}/#organization` },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        description: "Free to play — no entry fee",
      },
    },
    {
      "@type": "FAQPage",
      "@id": `${BASE_URL}/#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Gridlock?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Gridlock is a free-to-play Formula 1 prediction game where you predict the podium (1st, 2nd, 3rd place finishers) for each race in the 2026 F1 season. You earn points for correct predictions and compete on a global leaderboard.",
          },
        },
        {
          "@type": "Question",
          name: "How do I earn money playing Gridlock?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Top players on the Gridlock seasonal leaderboard earn prizes. By consistently predicting Formula 1 podiums correctly across the 24-race 2026 season, you accumulate points and climb toward prize positions.",
          },
        },
        {
          "@type": "Question",
          name: "Is Gridlock free to play?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes — Gridlock is completely free to join and play. Create an account, make your predictions before each race, and compete on the global leaderboard at no cost.",
          },
        },
        {
          "@type": "Question",
          name: "How is Gridlock different from F1 Fantasy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "F1 Fantasy requires managing driver budgets and team selections each week. Gridlock is simpler and more direct: pick your top 3 finishers before each race and score points based on accuracy. Pure prediction, pure skill.",
          },
        },
        {
          "@type": "Question",
          name: "When can I play Gridlock?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Gridlock is live for the entire 2026 Formula 1 season — 24 races from Bahrain to Abu Dhabi. Predictions lock when qualifying begins, so you need to pick before the action starts.",
          },
        },
        {
          "@type": "Question",
          name: "Can I play Gridlock on my phone?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes — Gridlock works on any device with a web browser, including iPhone and Android. The game is designed mobile-first so you can submit predictions and check the leaderboard on the go.",
          },
        },
        {
          "@type": "Question",
          name: "What prizes can I win playing Gridlock?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Top players on the Gridlock 2026 seasonal leaderboard earn real prizes. The better your F1 podium predictions across all 24 races, the higher your ranking and the better your prize eligibility.",
          },
        },
        {
          "@type": "Question",
          name: "How do private leagues work in Gridlock?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Gridlock private leagues let you compete directly against friends, colleagues, or an F1 fan community. Create a league, share the invite code, and track who has the best predictions across the full 2026 season.",
          },
        },
        {
          "@type": "Question",
          name: "Which Formula 1 drivers can I pick in Gridlock for 2026?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "All 20 drivers on the 2026 F1 grid are available: Max Verstappen, Liam Lawson, Lando Norris, Oscar Piastri, Charles Leclerc, Lewis Hamilton, George Russell, Andrea Kimi Antonelli, Fernando Alonso, Lance Stroll, Esteban Ocon, Oliver Bearman, Yuki Tsunoda, Isack Hadjar, Carlos Sainz, Alexander Albon, Nico Hülkenberg, Gabriel Bortoleto, Pierre Gasly, and Jack Doohan.",
          },
        },
      ],
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
        <SpeedInsights />
      </body>
    </html>
  );
}
