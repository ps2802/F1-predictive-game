type Race = {
  id: string;
  round: number;
  name: string;
  country: string;
  date: string;
  status: "upcoming" | "closed";
  flag: string;
};

export const races: Race[] = [
  { id: "australia-2026",   round:  1, name: "Australian Grand Prix",            country: "Australia",             date: "2026-03-08", status: "closed",   flag: "🇦🇺" },
  { id: "china-2026",       round:  2, name: "Chinese Grand Prix",               country: "China",                 date: "2026-03-15", status: "closed",   flag: "🇨🇳" },
  { id: "japan-2026",       round:  3, name: "Japanese Grand Prix",              country: "Japan",                 date: "2026-03-29", status: "closed",   flag: "🇯🇵" },
  { id: "miami-2026",       round:  4, name: "Miami Grand Prix",                 country: "United States",         date: "2026-05-03", status: "upcoming", flag: "🇺🇸" },
  { id: "canada-2026",      round:  5, name: "Canadian Grand Prix",              country: "Canada",                date: "2026-05-24", status: "upcoming", flag: "🇨🇦" },
  { id: "monaco-2026",      round:  6, name: "Monaco Grand Prix",                country: "Monaco",                date: "2026-06-07", status: "upcoming", flag: "🇲🇨" },
  { id: "spain-2026",       round:  7, name: "Barcelona-Catalunya Grand Prix",   country: "Spain",                 date: "2026-06-14", status: "upcoming", flag: "🇪🇸" },
  { id: "austria-2026",     round:  8, name: "Austrian Grand Prix",              country: "Austria",               date: "2026-06-28", status: "upcoming", flag: "🇦🇹" },
  { id: "britain-2026",     round:  9, name: "British Grand Prix",               country: "Great Britain",         date: "2026-07-05", status: "upcoming", flag: "🇬🇧" },
  { id: "belgium-2026",     round: 10, name: "Belgian Grand Prix",               country: "Belgium",               date: "2026-07-19", status: "upcoming", flag: "🇧🇪" },
  { id: "hungary-2026",     round: 11, name: "Hungarian Grand Prix",             country: "Hungary",               date: "2026-07-26", status: "upcoming", flag: "🇭🇺" },
  { id: "netherlands-2026", round: 12, name: "Dutch Grand Prix",                 country: "Netherlands",           date: "2026-08-23", status: "upcoming", flag: "🇳🇱" },
  { id: "italy-2026",       round: 13, name: "Italian Grand Prix",               country: "Italy",                 date: "2026-09-06", status: "upcoming", flag: "🇮🇹" },
  { id: "madrid-2026",      round: 14, name: "Spanish Grand Prix",               country: "Spain",                 date: "2026-09-13", status: "upcoming", flag: "🇪🇸" },
  { id: "azerbaijan-2026",  round: 15, name: "Azerbaijan Grand Prix",            country: "Azerbaijan",            date: "2026-09-26", status: "upcoming", flag: "🇦🇿" },
  { id: "singapore-2026",   round: 16, name: "Singapore Grand Prix",             country: "Singapore",             date: "2026-10-11", status: "upcoming", flag: "🇸🇬" },
  { id: "usa-2026",         round: 17, name: "United States Grand Prix",         country: "United States",         date: "2026-10-25", status: "upcoming", flag: "🇺🇸" },
  { id: "mexico-2026",      round: 18, name: "Mexico City Grand Prix",           country: "Mexico",                date: "2026-11-01", status: "upcoming", flag: "🇲🇽" },
  { id: "brazil-2026",      round: 19, name: "São Paulo Grand Prix",             country: "Brazil",                date: "2026-11-08", status: "upcoming", flag: "🇧🇷" },
  { id: "las-vegas-2026",   round: 20, name: "Las Vegas Grand Prix",             country: "United States",         date: "2026-11-21", status: "upcoming", flag: "🇺🇸" },
  { id: "qatar-2026",       round: 21, name: "Qatar Grand Prix",                 country: "Qatar",                 date: "2026-11-29", status: "upcoming", flag: "🇶🇦" },
  { id: "abu-dhabi-2026",   round: 22, name: "Abu Dhabi Grand Prix",             country: "United Arab Emirates",  date: "2026-12-06", status: "upcoming", flag: "🇦🇪" },
];

type FallbackRaceRecord = {
  id: string;
  season: number;
  round: number;
  name: string;
  grand_prix_name: string;
  country: string;
  race_date: string;
  race_starts_at: string;
  qualifying_starts_at: null;
  circuit: null;
  is_locked: boolean;
  race_locked: boolean;
  quali_locked: boolean;
};

type FallbackRaceTiming = {
  qualifying_starts_at: string | null;
  race_starts_at: string | null;
  quali_locked: boolean;
  race_locked: boolean;
};

type NextRaceSummary = {
  id: string;
  round: number;
  grand_prix_name: string;
  qualifying_starts_at: string | null;
  race_starts_at: string | null;
};

export function findRaceById(raceId: string): Race | null {
  return races.find((race) => race.id === raceId) ?? null;
}

export function buildFallbackRaceRecord(raceId: string): FallbackRaceRecord | null {
  const race = findRaceById(raceId);
  if (!race) {
    return null;
  }

  const isLocked = race.status === "closed";
  const season = Number(race.date.slice(0, 4)) || 2026;

  return {
    id: race.id,
    season,
    round: race.round,
    name: race.name,
    grand_prix_name: race.name,
    country: race.country,
    race_date: race.date,
    race_starts_at: `${race.date}T00:00:00.000Z`,
    qualifying_starts_at: null,
    circuit: null,
    is_locked: isLocked,
    race_locked: isLocked,
    quali_locked: isLocked,
  };
}

export function buildFallbackRaceTiming(raceId: string): FallbackRaceTiming | null {
  const race = buildFallbackRaceRecord(raceId);
  if (!race) {
    return null;
  }

  return {
    qualifying_starts_at: race.qualifying_starts_at,
    race_starts_at: race.race_starts_at,
    quali_locked: race.quali_locked,
    race_locked: race.race_locked,
  };
}

export function buildFallbackNextRace(now: Date = new Date()): NextRaceSummary | null {
  const fallbackRace =
    races.find((race) => race.status === "upcoming" && new Date(`${race.date}T00:00:00.000Z`) > now) ?? null;

  if (!fallbackRace) {
    return null;
  }

  return {
    id: fallbackRace.id,
    round: fallbackRace.round,
    grand_prix_name: fallbackRace.name,
    qualifying_starts_at: null,
    race_starts_at: `${fallbackRace.date}T00:00:00.000Z`,
  };
}
