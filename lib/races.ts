export type Race = {
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
  { id: "usa-2026",         round:  4, name: "Miami Grand Prix",                 country: "United States",         date: "2026-05-03", status: "upcoming", flag: "🇺🇸" },
  { id: "canada-2026",      round:  5, name: "Canadian Grand Prix",              country: "Canada",                date: "2026-05-24", status: "upcoming", flag: "🇨🇦" },
  { id: "monaco-2026",      round:  6, name: "Monaco Grand Prix",                country: "Monaco",                date: "2026-06-07", status: "upcoming", flag: "🇲🇨" },
  { id: "spain-2026",       round:  7, name: "Barcelona Grand Prix",             country: "Spain",                 date: "2026-06-14", status: "upcoming", flag: "🇪🇸" },
  { id: "austria-2026",     round:  8, name: "Austrian Grand Prix",              country: "Austria",               date: "2026-06-28", status: "upcoming", flag: "🇦🇹" },
  { id: "uk-2026",          round:  9, name: "British Grand Prix",               country: "Great Britain",         date: "2026-07-05", status: "upcoming", flag: "🇬🇧" },
  { id: "belgium-2026",     round: 10, name: "Belgian Grand Prix",               country: "Belgium",               date: "2026-07-19", status: "upcoming", flag: "🇧🇪" },
  { id: "hungary-2026",     round: 11, name: "Hungarian Grand Prix",             country: "Hungary",               date: "2026-07-26", status: "upcoming", flag: "🇭🇺" },
  { id: "netherlands-2026", round: 12, name: "Dutch Grand Prix",                 country: "Netherlands",           date: "2026-08-23", status: "upcoming", flag: "🇳🇱" },
  { id: "italy-2026",       round: 13, name: "Italian Grand Prix",               country: "Italy",                 date: "2026-09-06", status: "upcoming", flag: "🇮🇹" },
  { id: "spain-2026-2",     round: 14, name: "Spanish Grand Prix",               country: "Spain",                 date: "2026-09-13", status: "upcoming", flag: "🇪🇸" },
  { id: "azerbaijan-2026",  round: 15, name: "Azerbaijan Grand Prix",            country: "Azerbaijan",            date: "2026-09-26", status: "upcoming", flag: "🇦🇿" },
  { id: "singapore-2026",   round: 16, name: "Singapore Grand Prix",             country: "Singapore",             date: "2026-10-11", status: "upcoming", flag: "🇸🇬" },
  { id: "usa-2026-2",       round: 17, name: "United States Grand Prix",         country: "United States",         date: "2026-10-25", status: "upcoming", flag: "🇺🇸" },
  { id: "mexico-2026",      round: 18, name: "Mexico City Grand Prix",           country: "Mexico",                date: "2026-11-01", status: "upcoming", flag: "🇲🇽" },
  { id: "brazil-2026",      round: 19, name: "Brazilian Grand Prix",             country: "Brazil",                date: "2026-11-08", status: "upcoming", flag: "🇧🇷" },
  { id: "usa-2026-3",       round: 20, name: "Las Vegas Grand Prix",             country: "United States",         date: "2026-11-21", status: "upcoming", flag: "🇺🇸" },
  { id: "qatar-2026",       round: 21, name: "Qatar Grand Prix",                 country: "Qatar",                 date: "2026-11-29", status: "upcoming", flag: "🇶🇦" },
  { id: "uae-2026",         round: 22, name: "Abu Dhabi Grand Prix",             country: "United Arab Emirates",  date: "2026-12-06", status: "upcoming", flag: "🇦🇪" },
];

export type FallbackRaceRecord = {
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

export type FallbackRaceTiming = {
  qualifying_starts_at: string | null;
  race_starts_at: string | null;
  quali_locked: boolean;
  race_locked: boolean;
};

export type NextRaceSummary = {
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

export const drivers = [
  "Lando Norris",
  "Oscar Piastri",
  "George Russell",
  "Kimi Antonelli",
  "Max Verstappen",
  "Isack Hadjar",
  "Charles Leclerc",
  "Lewis Hamilton",
  "Carlos Sainz",
  "Alexander Albon",
  "Liam Lawson",
  "Arvid Lindblad",
  "Fernando Alonso",
  "Lance Stroll",
  "Esteban Ocon",
  "Oliver Bearman",
  "Nico Hulkenberg",
  "Gabriel Bortoleto",
  "Pierre Gasly",
  "Franco Colapinto",
  "Sergio Perez",
  "Valtteri Bottas",
];

export type DriverInfo = {
  name: string;
  number: number;
  team: string;
  teamColor: string;
};

export const driverInfo: DriverInfo[] = [
  { name: "Lando Norris",     number:  1, team: "McLaren",         teamColor: "#FF8000" },
  { name: "Oscar Piastri",    number: 81, team: "McLaren",         teamColor: "#FF8000" },
  { name: "George Russell",   number: 63, team: "Mercedes",        teamColor: "#27F4D2" },
  { name: "Kimi Antonelli",   number: 12, team: "Mercedes",        teamColor: "#27F4D2" },
  { name: "Max Verstappen",   number:  3, team: "Red Bull Racing", teamColor: "#3671C6" },
  { name: "Isack Hadjar",     number:  6, team: "Red Bull Racing", teamColor: "#3671C6" },
  { name: "Charles Leclerc",  number: 16, team: "Ferrari",         teamColor: "#E8002D" },
  { name: "Lewis Hamilton",   number: 44, team: "Ferrari",         teamColor: "#E8002D" },
  { name: "Carlos Sainz",     number: 55, team: "Williams",        teamColor: "#64C4FF" },
  { name: "Alexander Albon",  number: 23, team: "Williams",        teamColor: "#64C4FF" },
  { name: "Liam Lawson",      number: 30, team: "Racing Bulls",    teamColor: "#6692FF" },
  { name: "Arvid Lindblad",   number: 41, team: "Racing Bulls",    teamColor: "#6692FF" },
  { name: "Fernando Alonso",  number: 14, team: "Aston Martin",    teamColor: "#229971" },
  { name: "Lance Stroll",     number: 18, team: "Aston Martin",    teamColor: "#229971" },
  { name: "Esteban Ocon",     number: 31, team: "Haas F1 Team",    teamColor: "#B6BABD" },
  { name: "Oliver Bearman",   number: 87, team: "Haas F1 Team",    teamColor: "#B6BABD" },
  { name: "Nico Hulkenberg",  number: 27, team: "Audi",            teamColor: "#52E252" },
  { name: "Gabriel Bortoleto",number:  5, team: "Audi",            teamColor: "#52E252" },
  { name: "Pierre Gasly",     number: 10, team: "Alpine",          teamColor: "#FF87BC" },
  { name: "Franco Colapinto", number: 43, team: "Alpine",          teamColor: "#FF87BC" },
  { name: "Sergio Perez",     number: 11, team: "Cadillac",        teamColor: "#8A8F98" },
  { name: "Valtteri Bottas",  number: 77, team: "Cadillac",        teamColor: "#8A8F98" },
];
