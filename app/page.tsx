import Link from "next/link";

export default function HomePage() {
  return (
    <main className="stack">
      <section className="card stack">
        <span className="badge">F1 Predictive Game</span>
        <h1>Predict podiums. Earn points. Climb the leaderboard.</h1>
        <p className="small">
          Make race-by-race predictions before lights out. Get points when your picks match real-world
          results.
        </p>
        <div className="row">
          <Link className="button" href="/signup">
            Create account
          </Link>
          <Link className="button secondary" href="/login">
            Login
          </Link>
        </div>
      </section>

      <section className="grid grid-2">
        <article className="card">
          <h3>Simple scoring</h3>
          <p className="small">3 points for exact driver placement, 1 point for correct driver in top 3.</p>
        </article>
        <article className="card">
          <h3>Race timeline</h3>
          <p className="small">Predictions lock at race start. You can edit before the deadline.</p>
        </article>
      </section>
    </main>
  );
}
