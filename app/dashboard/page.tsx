import Link from "next/link";
import { races } from "@/lib/races";

export default function DashboardPage() {
  return (
    <main className="stack">
      <section className="card stack">
        <h1>Dashboard</h1>
        <p className="small">Pick a race to submit or update your podium prediction.</p>
      </section>

      <section className="grid">
        {races.map((race) => (
          <article className="card stack" key={race.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>
                Round {race.round}: {race.name}
              </h3>
              <span className="badge">{race.status}</span>
            </div>
            <p className="small">
              {race.country} | {new Date(race.date).toLocaleDateString()}
            </p>
            <Link className="button" href={`/predict/${race.id}`}>
              Predict this race
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
