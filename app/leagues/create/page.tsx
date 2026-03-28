import CreateLeaguePageClient from "./CreateLeaguePageClient";

type CreateLeaguePageProps = {
  searchParams?: Promise<{ raceId?: string }>;
};

export default async function CreateLeaguePage({
  searchParams,
}: CreateLeaguePageProps) {
  const params = await searchParams;

  return <CreateLeaguePageClient initialRaceId={params?.raceId ?? null} />;
}
