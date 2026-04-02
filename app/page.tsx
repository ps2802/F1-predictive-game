import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LandingPageAnalytics } from "@/app/components/LandingPageAnalytics";
import { TrackedLink } from "@/app/components/TrackedLink";

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-black text-white font-[family-name:var(--font-titillium)]">
      <LandingPageAnalytics />
      {/* ── Nav ── */}
      <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="text-xl font-bold tracking-widest uppercase text-white">
          GRID<span className="text-[#E10600]">LOCK</span>
        </span>
        <TrackedLink
          href="/login"
          event="landing_cta_clicked"
          properties={{ cta_location: "nav_sign_in" }}
          className="text-sm font-semibold tracking-wider uppercase text-white/70 hover:text-white transition-colors"
        >
          Sign In
        </TrackedLink>
      </nav>

      {/* ── Hero ── */}
      <section className="px-6 py-24 text-center max-w-4xl mx-auto">
        <div className="inline-block text-xs font-bold tracking-[0.3em] uppercase text-[#E10600] mb-6 border border-[#E10600]/30 px-3 py-1">
          2026 F1 Season · Now Live
        </div>
        <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tight leading-none mb-6">
          The F1 Prediction Game
          <br />
          <span className="text-[#E10600]">Built for Real Fans</span>
        </h1>
        <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
          Predict podium finishes for every Formula 1 race in 2026. Outsmart
          thousands of fans on a global leaderboard. Earn prizes by getting it
          right — one race at a time.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <TrackedLink
            href="/login"
            event="landing_cta_clicked"
            properties={{ cta_location: "hero_primary" }}
            className="inline-block bg-[#E10600] hover:bg-red-500 text-white font-bold uppercase tracking-widest text-sm px-10 py-4 transition-colors"
          >
            Play Free — Join Now
          </TrackedLink>
          <TrackedLink
            href="#how-it-works"
            event="how_it_works_clicked"
            properties={{ cta_location: "hero_secondary" }}
            className="inline-block border border-white/20 hover:border-white/60 text-white/70 hover:text-white font-semibold uppercase tracking-widest text-sm px-10 py-4 transition-colors"
          >
            How It Works
          </TrackedLink>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <div className="border-y border-white/10 bg-white/5">
        <div className="max-w-4xl mx-auto px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "24", label: "Races in 2026" },
            { value: "20", label: "Active Drivers" },
            { value: "3", label: "Podium Picks" },
            { value: "Free", label: "Entry" },
          ].map(({ value, label }) => (
            <div key={label}>
              <div className="text-3xl font-black text-[#E10600]">{value}</div>
              <div className="text-xs uppercase tracking-widest text-white/50 mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2026 Driver Roster ── */}
      <section className="px-6 py-12 max-w-5xl mx-auto" aria-label="2026 F1 drivers in Gridlock">
        <h2 className="text-xs font-bold tracking-[0.3em] uppercase text-white/30 text-center mb-6">
          2026 F1 Grid · All 20 Drivers Available
        </h2>
        <ul className="flex flex-wrap justify-center gap-2">
          {[
            "Max Verstappen", "Liam Lawson", "Lando Norris", "Oscar Piastri",
            "Charles Leclerc", "Lewis Hamilton", "George Russell", "Andrea Kimi Antonelli",
            "Fernando Alonso", "Lance Stroll", "Esteban Ocon", "Oliver Bearman",
            "Yuki Tsunoda", "Isack Hadjar", "Carlos Sainz", "Alexander Albon",
            "Nico Hülkenberg", "Gabriel Bortoleto", "Pierre Gasly", "Jack Doohan",
          ].map((driver) => (
            <li
              key={driver}
              className="text-xs text-white/40 border border-white/10 px-3 py-1 uppercase tracking-wider"
            >
              {driver}
            </li>
          ))}
        </ul>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        className="px-6 py-24 max-w-5xl mx-auto"
        aria-labelledby="how-heading"
      >
        <h2
          id="how-heading"
          className="text-3xl md:text-4xl font-black uppercase tracking-tight text-center mb-16"
        >
          How to Play Gridlock
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              title: "Predict the Podium",
              body: "Before qualifying locks, pick your P1, P2, and P3 for each Formula 1 Grand Prix. 24 rounds, 20 drivers — every pick counts.",
            },
            {
              step: "02",
              title: "Score Points",
              body: "Exact position = 3 pts. Right driver, wrong position = 1 pt. Scores are calculated automatically the moment official results drop.",
            },
            {
              step: "03",
              title: "Climb the Leaderboard",
              body: "Compete on a global leaderboard across the entire 2026 season. The best predictions over 24 races win prizes.",
            },
          ].map(({ step, title, body }) => (
            <article
              key={step}
              className="border border-white/10 p-8 relative"
            >
              <div className="text-5xl font-black text-[#E10600]/20 absolute top-4 right-6 select-none">
                {step}
              </div>
              <h3 className="text-lg font-bold uppercase tracking-wide mb-3">
                {title}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Why Gridlock ── */}
      <section className="px-6 py-24 bg-white/[0.02] border-y border-white/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-center mb-4">
            Why Gridlock?
          </h2>
          <p className="text-center text-white/50 text-sm mb-16 max-w-xl mx-auto">
            F1 fantasy games are complicated. We built something better — pure
            skill, pure prediction, no fluff.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: "Skill Over Luck",
                body: "No random elements. No salary caps to juggle. Just your knowledge of Formula 1 — which drivers are fastest, who handles pressure, who wins in the rain.",
              },
              {
                title: "Earn Real Prizes",
                body: "Gridlock isn't just bragging rights. Top players on the seasonal leaderboard earn real prizes. The more races you predict, the better your edge.",
              },
              {
                title: "Race-by-Race Prediction",
                body: "Lock in predictions before each qualifying session. Miss a race? No problem — every round is its own battle with its own points on the line.",
              },
              {
                title: "Private Leagues",
                body: "Create a private league with your friends, your office, or your F1 fan group. Beat them across the full 2026 season.",
              },
            ].map(({ title, body }) => (
              <article
                key={title}
                className="flex gap-4 p-6 border border-white/10"
              >
                <div
                  className="w-1 shrink-0 bg-[#E10600] mt-1"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-bold uppercase tracking-wide text-sm mb-2">
                    {title}
                  </h3>
                  <p className="text-white/60 text-sm leading-relaxed">{body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ (for Google rich results) ── */}
      <section className="px-6 py-24 max-w-3xl mx-auto" aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="text-3xl font-black uppercase tracking-tight text-center mb-12"
        >
          Frequently Asked Questions
        </h2>
        <dl className="space-y-6">
          {[
            {
              q: "What is Gridlock?",
              a: "Gridlock is a free-to-play Formula 1 prediction game where you predict the podium (1st, 2nd, 3rd place finishers) for each race in the 2026 F1 season. You earn points for correct predictions and compete on a global leaderboard.",
            },
            {
              q: "How do I earn money playing Gridlock?",
              a: "Top players on the Gridlock seasonal leaderboard earn prizes. By consistently predicting Formula 1 podiums correctly across the 24-race 2026 season, you accumulate points and climb toward prize positions.",
            },
            {
              q: "Is Gridlock free to play?",
              a: "Yes — Gridlock is completely free to join and play. Create an account, make your predictions before each race, and compete on the global leaderboard at no cost.",
            },
            {
              q: "How is Gridlock different from F1 Fantasy?",
              a: "F1 Fantasy requires managing driver budgets and team selections each week. Gridlock is simpler and more direct: pick your top 3 finishers before each race and score points based on accuracy. Pure prediction, pure skill.",
            },
            {
              q: "When can I play Gridlock?",
              a: "Gridlock is live for the entire 2026 Formula 1 season — 24 races from Bahrain to Abu Dhabi. Predictions lock when qualifying begins, so you need to pick before the action starts.",
            },
            {
              q: "Can I play Gridlock on my phone?",
              a: "Yes — Gridlock works on any device with a web browser, including iPhone and Android. The game is designed mobile-first so you can submit your F1 predictions and check the leaderboard on the go.",
            },
            {
              q: "What prizes can I win?",
              a: "Top players on the seasonal leaderboard earn real prizes. The more accurately you predict Formula 1 podiums across all 24 races, the higher your ranking and the better your prize eligibility.",
            },
            {
              q: "How do private leagues work?",
              a: "Create a private Gridlock league, share an invite code, and compete head-to-head against friends, colleagues, or your F1 fan group. Track who has the best predictions across the full 2026 season.",
            },
            {
              q: "Which drivers can I pick in 2026?",
              a: "All 20 drivers on the 2026 F1 grid — including Max Verstappen, Lando Norris, Charles Leclerc, Lewis Hamilton, and Oscar Piastri — are available to pick in every race.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="border border-white/10 p-6">
              <dt className="font-bold text-sm uppercase tracking-wide mb-2">
                {q}
              </dt>
              <dd className="text-white/60 text-sm leading-relaxed">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── CTA ── */}
      <section className="px-6 py-24 text-center bg-[#E10600]/10 border-t border-[#E10600]/20">
        <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-4">
          Ready to Predict the Grid?
        </h2>
        <p className="text-white/60 mb-10 max-w-lg mx-auto">
          Join thousands of F1 fans competing in the 2026 season prediction
          game. Free entry. Real prizes. Starts now.
        </p>
        <TrackedLink
          href="/login"
          event="landing_cta_clicked"
          properties={{ cta_location: "footer_primary" }}
          className="inline-block bg-[#E10600] hover:bg-red-500 text-white font-bold uppercase tracking-widest text-sm px-12 py-4 transition-colors"
        >
          Create Free Account
        </TrackedLink>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 px-6 py-10 text-center text-white/30 text-xs">
        <p className="uppercase tracking-widest font-bold mb-2 text-white/50">
          GRIDLOCK — The F1 Prediction Game
        </p>
        <p className="mb-4">
          joingridlock.com · 2026 Formula 1 Season · 24 Races · 20 Drivers
        </p>
        <nav aria-label="Footer links" className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4">
          <TrackedLink
            href="/login"
            event="landing_cta_clicked"
            properties={{ cta_location: "footer_signup" }}
            className="hover:text-white/60 transition-colors"
          >
            Create Free Account
          </TrackedLink>
          <TrackedLink
            href="#how-it-works"
            event="how_it_works_clicked"
            properties={{ cta_location: "footer_how" }}
            className="hover:text-white/60 transition-colors"
          >
            How It Works
          </TrackedLink>
          <a href="#faq-heading" className="hover:text-white/60 transition-colors">
            FAQ
          </a>
        </nav>
        <p className="text-white/15">
          Free F1 prediction game · Predict the Formula 1 podium · Earn prizes · 2026 season
        </p>
      </footer>
    </main>
  );
}
