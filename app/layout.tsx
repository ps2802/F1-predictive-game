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
    default: "Gridlock, Predict F1 races. Beat your friends.",
    template: "%s | Gridlock",
  },
  description:
    "Gridlock is an F1 prediction game where you predict race outcomes, compete with friends, and prove your grid instincts every race weekend.",
  keywords: [
    "F1 prediction game",
    "Formula 1 prediction game",
    "F1 predictions 2026",
    "Formula 1 predictions",
    "F1 fantasy alternative",
    "F1 prediction game with friends",
    "F1 game for friends",
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
    title: "Gridlock — Predict F1 races. Beat your friends.",
    description:
      "Predict podium finishes across the 2026 F1 season, compete with friends, and climb the leaderboard every race weekend.",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Gridlock — Predict F1 races. Beat your friends. · 2026 Season",
      },
    ],
  },

  /* ── Twitter / X ── */
  twitter: {
    card: "summary_large_image",
    site: "@GridlockLeague",
    creator: "@GridlockLeague",
    title: "Gridlock — Predict F1 races. Beat your friends.",
    description:
      "Predict podiums, compete with friends, and climb the leaderboard. 22 races. 22 drivers. Every 2026 race weekend.",
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
        "The F1 prediction game. Predict the grid, compete with friends, climb the leaderboard. 2026 season.",
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
        "Predict podium finishes across the 2026 Formula 1 season, compete with friends, and climb the global leaderboard.",
      url: BASE_URL,
      genre: ["Sports", "Strategy", "Prediction"],
      gamePlatform: ["Web Browser", "Mobile Browser"],
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      numberOfPlayers: { "@type": "QuantitativeValue", minValue: 1 },
      publisher: { "@id": `${BASE_URL}/#organization` },
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
          name: "How do I score points in Gridlock?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You earn points for every correct podium prediction across the 22-race 2026 season. The more accurate your calls, the higher you climb the leaderboard against your friends and the global field.",
          },
        },
        {
          "@type": "Question",
          name: "Is Gridlock free to play?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes — Gridlock is completely free to join and play. Create an account, make your predictions before each race, and compete with friends on the leaderboard at no cost.",
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
            text: "Gridlock is live for the entire 2026 Formula 1 season — 22 races from Australia to Abu Dhabi. Predictions lock when qualifying begins, so you need to pick before the action starts.",
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
            text: "All 22 drivers on the 2026 F1 grid are available: Lando Norris, Oscar Piastri, George Russell, Kimi Antonelli, Max Verstappen, Isack Hadjar, Charles Leclerc, Lewis Hamilton, Carlos Sainz, Alexander Albon, Liam Lawson, Arvid Lindblad, Fernando Alonso, Lance Stroll, Esteban Ocon, Oliver Bearman, Nico Hulkenberg, Gabriel Bortoleto, Pierre Gasly, Franco Colapinto, Sergio Perez, and Valtteri Bottas.",
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
