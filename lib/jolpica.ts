const JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1";

export type JolpicaRace = {
  season: string;
  round: string;
  raceName: string;
  Circuit: {
    circuitId: string;
    circuitName: string;
    Location: {
      locality: string;
      country: string;
    };
  };
  date: string;
  time?: string;
  Qualifying?: {
    date: string;
    time?: string;
  };
};

type JolpicaScheduleResponse = {
  MRData?: {
    RaceTable?: {
      Races?: JolpicaRace[];
    };
  };
};

export type RaceSeedRow = {
  id: string;
  season: number;
  round: number;
  name: string;
  grand_prix_name: string;
  country: string;
  circuit: string;
  race_date: string;
  race_starts_at: string | null;
  qualifying_starts_at: string | null;
  is_locked: boolean;
  race_locked: boolean;
};

const COUNTRY_ID_ALIASES: Record<string, string> = {
  "Great Britain": "britain",
  "Saudi Arabia": "saudi",
  "United Arab Emirates": "abu-dhabi",
  UK: "britain",
  UAE: "abu-dhabi",
};

const CIRCUIT_ID_ALIASES: Record<string, string> = {
  americas: "usa",
  catalunya: "spain",
  interlagos: "brazil",
  jeddah: "saudi",
  las_vegas: "las-vegas",
  madrid: "madrid",
  madring: "madrid",
  miami: "miami",
  rodriguez: "mexico",
  silverstone: "britain",
  vegas: "las-vegas",
  yas_marina: "abu-dhabi",
};

const COUNTRY_DISPLAY_ALIASES: Record<string, string> = {
  UK: "Great Britain",
  UAE: "United Arab Emirates",
  USA: "United States",
};

function slugifySegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildSessionIso(date?: string | null, time?: string | null): string | null {
  if (!date) {
    return null;
  }

  if (!time) {
    return `${date}T00:00:00.000Z`;
  }

  return `${date}T${time.endsWith("Z") ? time : `${time}Z`}`;
}

export function buildRaceId(race: JolpicaRace): string {
  const country = race.Circuit.Location.country;
  const baseId =
    CIRCUIT_ID_ALIASES[race.Circuit.circuitId] ??
    COUNTRY_ID_ALIASES[country] ??
    slugifySegment(country);

  return `${baseId}-${race.season}`;
}

export async function fetchSeasonSchedule(
  season: number,
  init?: RequestInit
): Promise<JolpicaRace[]> {
  const response = await fetch(`${JOLPICA_BASE_URL}/${season}/races.json`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Jolpica schedule request failed with ${response.status}.`);
  }

  const data = (await response.json()) as JolpicaScheduleResponse;
  const races = data.MRData?.RaceTable?.Races;

  if (!Array.isArray(races)) {
    throw new Error("Jolpica schedule response did not include races.");
  }

  return races;
}

export function buildRaceSeedRows(
  races: JolpicaRace[],
  now = new Date()
): RaceSeedRow[] {
  return races.map((race) => {
    const country =
      COUNTRY_DISPLAY_ALIASES[race.Circuit.Location.country] ??
      race.Circuit.Location.country;
    const raceStartsAt = buildSessionIso(race.date, race.time ?? null);
    const qualifyingStartsAt = buildSessionIso(
      race.Qualifying?.date ?? null,
      race.Qualifying?.time ?? null
    );
    const lockDeadline = qualifyingStartsAt ?? raceStartsAt;
    const isLocked = lockDeadline != null && new Date(lockDeadline) <= now;

    return {
      id: buildRaceId(race),
      season: Number(race.season),
      round: Number(race.round),
      name: race.raceName.trim(),
      grand_prix_name: race.raceName.trim(),
      country: country.trim(),
      circuit: race.Circuit.circuitName.trim(),
      race_date: race.date,
      race_starts_at: raceStartsAt,
      qualifying_starts_at: qualifyingStartsAt,
      is_locked: isLocked,
      race_locked: isLocked,
    };
  });
}
