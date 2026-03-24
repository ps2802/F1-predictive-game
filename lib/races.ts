export type Race = {
  id: string;
  round: number;
  name: string;
  country: string;
  date: string;
  status: "upcoming" | "closed";
};

export const races: Race[] = [
  { id: "australia-2026",   round:  1, name: "Australian Grand Prix",   country: "Australia",    date: "2026-03-15", status: "closed" },
  { id: "china-2026",       round:  2, name: "Chinese Grand Prix",       country: "China",        date: "2026-03-22", status: "closed" },
  { id: "japan-2026",       round:  3, name: "Japanese Grand Prix",      country: "Japan",        date: "2026-04-05", status: "upcoming" },
  { id: "bahrain-2026",     round:  4, name: "Bahrain Grand Prix",       country: "Bahrain",      date: "2026-04-19", status: "upcoming" },
  { id: "saudi-2026",       round:  5, name: "Saudi Arabian Grand Prix", country: "Saudi Arabia", date: "2026-05-03", status: "upcoming" },
  { id: "miami-2026",       round:  6, name: "Miami Grand Prix",         country: "USA",          date: "2026-05-17", status: "upcoming" },
  { id: "monaco-2026",      round:  7, name: "Monaco Grand Prix",        country: "Monaco",       date: "2026-05-31", status: "upcoming" },
  { id: "spain-2026",       round:  8, name: "Spanish Grand Prix",       country: "Spain",        date: "2026-06-14", status: "upcoming" },
  { id: "canada-2026",      round:  9, name: "Canadian Grand Prix",      country: "Canada",       date: "2026-06-21", status: "upcoming" },
  { id: "austria-2026",     round: 10, name: "Austrian Grand Prix",      country: "Austria",      date: "2026-07-05", status: "upcoming" },
  { id: "britain-2026",     round: 11, name: "British Grand Prix",       country: "Britain",      date: "2026-07-12", status: "upcoming" },
  { id: "belgium-2026",     round: 12, name: "Belgian Grand Prix",       country: "Belgium",      date: "2026-07-26", status: "upcoming" },
  { id: "hungary-2026",     round: 13, name: "Hungarian Grand Prix",     country: "Hungary",      date: "2026-08-02", status: "upcoming" },
  { id: "netherlands-2026", round: 14, name: "Dutch Grand Prix",         country: "Netherlands",  date: "2026-08-30", status: "upcoming" },
  { id: "italy-2026",       round: 15, name: "Italian Grand Prix",       country: "Italy",        date: "2026-09-06", status: "upcoming" },
  { id: "azerbaijan-2026",  round: 16, name: "Azerbaijan Grand Prix",    country: "Azerbaijan",   date: "2026-09-20", status: "upcoming" },
  { id: "singapore-2026",   round: 17, name: "Singapore Grand Prix",     country: "Singapore",    date: "2026-10-04", status: "upcoming" },
  { id: "usa-2026",         round: 18, name: "United States Grand Prix", country: "USA",          date: "2026-10-18", status: "upcoming" },
  { id: "mexico-2026",      round: 19, name: "Mexico City Grand Prix",   country: "Mexico",       date: "2026-11-01", status: "upcoming" },
  { id: "brazil-2026",      round: 20, name: "São Paulo Grand Prix",     country: "Brazil",       date: "2026-11-15", status: "upcoming" },
  { id: "las-vegas-2026",   round: 21, name: "Las Vegas Grand Prix",     country: "USA",          date: "2026-11-22", status: "upcoming" },
  { id: "qatar-2026",       round: 22, name: "Qatar Grand Prix",         country: "Qatar",        date: "2026-11-29", status: "upcoming" },
  { id: "abu-dhabi-2026",   round: 23, name: "Abu Dhabi Grand Prix",     country: "UAE",          date: "2026-12-06", status: "upcoming" },
];

export const drivers = [
  "Max Verstappen",
  "Liam Lawson",
  "Lando Norris",
  "Oscar Piastri",
  "Charles Leclerc",
  "Lewis Hamilton",
  "George Russell",
  "Andrea Kimi Antonelli",
  "Fernando Alonso",
  "Lance Stroll",
  "Carlos Sainz",
  "Alexander Albon",
  "Nico Hülkenberg",
  "Oliver Bearman",
  "Yuki Tsunoda",
  "Isack Hadjar",
  "Esteban Ocon",
  "Jack Doohan",
  "Gabriel Bortoleto",
  "Pierre Gasly",
];
