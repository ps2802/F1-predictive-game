import LeaguesPageClient from "./LeaguesPageClient";

type LeaguesPageProps = {
  searchParams?: Promise<{ raceId?: string }>;
};

export default async function LeaguesPage({ searchParams }: LeaguesPageProps) {
  const params = await searchParams;

  return <LeaguesPageClient initialRaceId={params?.raceId ?? null} />;
}
