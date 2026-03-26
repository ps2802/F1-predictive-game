export type Race = {
  id: string;
  round: number;
  name: string;
  country: string;
  date: string;
  status: "upcoming" | "closed";
};

export const races: Race[] = [
  { id: "australia-2026",   round:  1, name: "Australian Grand Prix",          country: "Australia",             date: "2026-03-08", status: "closed" },
  { id: "china-2026",       round:  2, name: "Chinese Grand Prix",             country: "China",                 date: "2026-03-15", status: "closed" },
  { id: "japan-2026",       round:  3, name: "Japanese Grand Prix",            country: "Japan",                 date: "2026-03-29", status: "upcoming" },
  { id: "bahrain-2026",     round:  4, name: "Bahrain Grand Prix",             country: "Bahrain",               date: "2026-04-12", status: "upcoming" },
  { id: "saudi-arabia-2026",round:  5, name: "Saudi Arabian Grand Prix",       country: "Saudi Arabia",          date: "2026-04-19", status: "upcoming" },
  { id: "usa-2026",         round:  6, name: "Miami Grand Prix",               country: "United States",         date: "2026-05-03", status: "upcoming" },
  { id: "canada-2026",      round:  7, name: "Canadian Grand Prix",            country: "Canada",                date: "2026-05-24", status: "upcoming" },
  { id: "monaco-2026",      round:  8, name: "Monaco Grand Prix",              country: "Monaco",                date: "2026-06-07", status: "upcoming" },
  { id: "spain-2026",       round:  9, name: "Barcelona-Catalunya Grand Prix", country: "Spain",                 date: "2026-06-14", status: "upcoming" },
  { id: "austria-2026",     round: 10, name: "Austrian Grand Prix",            country: "Austria",               date: "2026-06-28", status: "upcoming" },
  { id: "uk-2026",          round: 11, name: "British Grand Prix",             country: "United Kingdom",        date: "2026-07-05", status: "upcoming" },
  { id: "belgium-2026",     round: 12, name: "Belgian Grand Prix",             country: "Belgium",               date: "2026-07-19", status: "upcoming" },
  { id: "hungary-2026",     round: 13, name: "Hungarian Grand Prix",           country: "Hungary",               date: "2026-07-26", status: "upcoming" },
  { id: "netherlands-2026", round: 14, name: "Dutch Grand Prix",               country: "Netherlands",           date: "2026-08-23", status: "upcoming" },
  { id: "italy-2026",       round: 15, name: "Italian Grand Prix",             country: "Italy",                 date: "2026-09-06", status: "upcoming" },
  { id: "spain-2026-2",     round: 16, name: "Spanish Grand Prix",             country: "Spain",                 date: "2026-09-13", status: "upcoming" },
  { id: "azerbaijan-2026",  round: 17, name: "Azerbaijan Grand Prix",          country: "Azerbaijan",            date: "2026-09-26", status: "upcoming" },
  { id: "singapore-2026",   round: 18, name: "Singapore Grand Prix",           country: "Singapore",             date: "2026-10-11", status: "upcoming" },
  { id: "usa-2026-2",       round: 19, name: "United States Grand Prix",       country: "United States",         date: "2026-10-25", status: "upcoming" },
  { id: "mexico-2026",      round: 20, name: "Mexico City Grand Prix",         country: "Mexico",                date: "2026-11-01", status: "upcoming" },
  { id: "brazil-2026",      round: 21, name: "São Paulo Grand Prix",           country: "Brazil",                date: "2026-11-08", status: "upcoming" },
  { id: "usa-2026-3",       round: 22, name: "Las Vegas Grand Prix",           country: "United States",         date: "2026-11-21", status: "upcoming" },
  { id: "qatar-2026",       round: 23, name: "Qatar Grand Prix",               country: "Qatar",                 date: "2026-11-29", status: "upcoming" },
  { id: "uae-2026",         round: 24, name: "Abu Dhabi Grand Prix",           country: "United Arab Emirates",  date: "2026-12-06", status: "upcoming" },
];

export const drivers = [
  "Max Verstappen",
  "Isack Hadjar",
  "Lando Norris",
  "Oscar Piastri",
  "Charles Leclerc",
  "Lewis Hamilton",
  "George Russell",
  "Kimi Antonelli",
  "Fernando Alonso",
  "Lance Stroll",
  "Alexander Albon",
  "Carlos Sainz",
  "Oliver Bearman",
  "Esteban Ocon",
  "Nico Hulkenberg",
  "Gabriel Bortoleto",
  "Liam Lawson",
  "Arvid Lindblad",
  "Pierre Gasly",
  "Franco Colapinto",
  "Sergio Perez",
  "Valtteri Bottas",
];

export const constructors = [
  "Red Bull Racing",
  "McLaren",
  "Ferrari",
  "Mercedes",
  "Aston Martin",
  "Williams",
  "Haas F1 Team",
  "Audi",
  "Racing Bulls",
  "Alpine",
  "Cadillac",
];
