export type Race = {
  id: string;
  round: number;
  name: string;
  country: string;
  date: string;
  status: "upcoming" | "closed";
};

export const races: Race[] = [
  {
    id: "australia-2026",
    round: 1,
    name: "Australian Grand Prix",
    country: "Australia",
    date: "2026-03-15",
    status: "upcoming",
  },
  {
    id: "japan-2026",
    round: 2,
    name: "Japanese Grand Prix",
    country: "Japan",
    date: "2026-03-29",
    status: "upcoming",
  },
  {
    id: "bahrain-2026",
    round: 3,
    name: "Bahrain Grand Prix",
    country: "Bahrain",
    date: "2026-04-12",
    status: "upcoming",
  },
];

export const drivers = [
  "Max Verstappen",
  "Lando Norris",
  "Charles Leclerc",
  "Lewis Hamilton",
  "Oscar Piastri",
  "George Russell",
  "Fernando Alonso",
  "Carlos Sainz",
  "Sergio Perez",
  "Yuki Tsunoda",
];
