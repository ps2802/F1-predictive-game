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
  { id: "australia-2026",   round:  1, name: "Australian Grand Prix",   country: "Australia",    date: "2026-03-15", status: "closed",   flag: "🇦🇺" },
  { id: "china-2026",       round:  2, name: "Chinese Grand Prix",       country: "China",        date: "2026-03-22", status: "closed",   flag: "🇨🇳" },
  { id: "japan-2026",       round:  3, name: "Japanese Grand Prix",      country: "Japan",        date: "2026-04-05", status: "upcoming", flag: "🇯🇵" },
  { id: "bahrain-2026",     round:  4, name: "Bahrain Grand Prix",       country: "Bahrain",      date: "2026-04-19", status: "upcoming", flag: "🇧🇭" },
  { id: "saudi-2026",       round:  5, name: "Saudi Arabian Grand Prix", country: "Saudi Arabia", date: "2026-05-03", status: "upcoming", flag: "🇸🇦" },
  { id: "miami-2026",       round:  6, name: "Miami Grand Prix",         country: "USA",          date: "2026-05-17", status: "upcoming", flag: "🇺🇸" },
  { id: "monaco-2026",      round:  7, name: "Monaco Grand Prix",        country: "Monaco",       date: "2026-05-31", status: "upcoming", flag: "🇲🇨" },
  { id: "spain-2026",       round:  8, name: "Spanish Grand Prix",       country: "Spain",        date: "2026-06-14", status: "upcoming", flag: "🇪🇸" },
  { id: "canada-2026",      round:  9, name: "Canadian Grand Prix",      country: "Canada",       date: "2026-06-21", status: "upcoming", flag: "🇨🇦" },
  { id: "austria-2026",     round: 10, name: "Austrian Grand Prix",      country: "Austria",      date: "2026-07-05", status: "upcoming", flag: "🇦🇹" },
  { id: "britain-2026",     round: 11, name: "British Grand Prix",       country: "Britain",      date: "2026-07-12", status: "upcoming", flag: "🇬🇧" },
  { id: "belgium-2026",     round: 12, name: "Belgian Grand Prix",       country: "Belgium",      date: "2026-07-26", status: "upcoming", flag: "🇧🇪" },
  { id: "hungary-2026",     round: 13, name: "Hungarian Grand Prix",     country: "Hungary",      date: "2026-08-02", status: "upcoming", flag: "🇭🇺" },
  { id: "netherlands-2026", round: 14, name: "Dutch Grand Prix",         country: "Netherlands",  date: "2026-08-30", status: "upcoming", flag: "🇳🇱" },
  { id: "italy-2026",       round: 15, name: "Italian Grand Prix",       country: "Italy",        date: "2026-09-06", status: "upcoming", flag: "🇮🇹" },
  { id: "azerbaijan-2026",  round: 16, name: "Azerbaijan Grand Prix",    country: "Azerbaijan",   date: "2026-09-20", status: "upcoming", flag: "🇦🇿" },
  { id: "singapore-2026",   round: 17, name: "Singapore Grand Prix",     country: "Singapore",    date: "2026-10-04", status: "upcoming", flag: "🇸🇬" },
  { id: "usa-2026",         round: 18, name: "United States Grand Prix", country: "USA",          date: "2026-10-18", status: "upcoming", flag: "🇺🇸" },
  { id: "mexico-2026",      round: 19, name: "Mexico City Grand Prix",   country: "Mexico",       date: "2026-11-01", status: "upcoming", flag: "🇲🇽" },
  { id: "brazil-2026",      round: 20, name: "São Paulo Grand Prix",     country: "Brazil",       date: "2026-11-15", status: "upcoming", flag: "🇧🇷" },
  { id: "las-vegas-2026",   round: 21, name: "Las Vegas Grand Prix",     country: "USA",          date: "2026-11-22", status: "upcoming", flag: "🇺🇸" },
  { id: "qatar-2026",       round: 22, name: "Qatar Grand Prix",         country: "Qatar",        date: "2026-11-29", status: "upcoming", flag: "🇶🇦" },
  { id: "abu-dhabi-2026",   round: 23, name: "Abu Dhabi Grand Prix",     country: "UAE",          date: "2026-12-06", status: "upcoming", flag: "🇦🇪" },
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

export type DriverInfo = {
  name: string;
  number: number;
  team: string;
  teamColor: string;
};

export const driverInfo: DriverInfo[] = [
  { name: "Max Verstappen",       number:  1, team: "Red Bull Racing",  teamColor: "#3671C6" },
  { name: "Liam Lawson",          number: 30, team: "Red Bull Racing",  teamColor: "#3671C6" },
  { name: "Lando Norris",         number:  4, team: "McLaren",          teamColor: "#FF8000" },
  { name: "Oscar Piastri",        number: 81, team: "McLaren",          teamColor: "#FF8000" },
  { name: "Charles Leclerc",      number: 16, team: "Ferrari",          teamColor: "#E8002D" },
  { name: "Lewis Hamilton",       number: 44, team: "Ferrari",          teamColor: "#E8002D" },
  { name: "George Russell",       number: 63, team: "Mercedes",         teamColor: "#27F4D2" },
  { name: "Andrea Kimi Antonelli",number: 12, team: "Mercedes",         teamColor: "#27F4D2" },
  { name: "Fernando Alonso",      number: 14, team: "Aston Martin",     teamColor: "#229971" },
  { name: "Lance Stroll",         number: 18, team: "Aston Martin",     teamColor: "#229971" },
  { name: "Carlos Sainz",         number: 55, team: "Williams",         teamColor: "#64C4FF" },
  { name: "Alexander Albon",      number: 23, team: "Williams",         teamColor: "#64C4FF" },
  { name: "Nico Hülkenberg",      number: 27, team: "Kick Sauber",      teamColor: "#52E252" },
  { name: "Gabriel Bortoleto",    number:  5, team: "Kick Sauber",      teamColor: "#52E252" },
  { name: "Yuki Tsunoda",         number: 22, team: "RB",               teamColor: "#6692FF" },
  { name: "Isack Hadjar",         number:  6, team: "RB",               teamColor: "#6692FF" },
  { name: "Esteban Ocon",         number: 31, team: "Haas",             teamColor: "#B6BABD" },
  { name: "Oliver Bearman",       number: 87, team: "Haas",             teamColor: "#B6BABD" },
  { name: "Pierre Gasly",         number: 10, team: "Alpine",           teamColor: "#FF87BC" },
  { name: "Jack Doohan",          number:  7, team: "Alpine",           teamColor: "#FF87BC" },
];
