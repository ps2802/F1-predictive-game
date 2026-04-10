import { races as staticRaces } from "@/lib/races";

export type DashboardPredictionStatus = "none" | "draft" | "active";
export type DashboardRaceStatus = "open" | "locked";

export interface DashboardProfile {
  username: string | null;
  balanceUsdc: number | null;
  isAdmin: boolean;
}

export interface DashboardMetricState {
  globalRank: number | null;
  seasonScore: number;
  leaguesJoined: number;
  walletBalance: number | null;
}

export interface DashboardRaceRow {
  id: string;
  round: number;
  name: string;
  country: string | null;
  flag: string | null;
  date: string | null;
  qualifyingStartsAt: string | null;
  raceStartsAt: string | null;
  raceStatus: DashboardRaceStatus;
  predictionStatus: DashboardPredictionStatus;
  isNext: boolean;
}

export interface DashboardLeaderboardEntry {
  userId: string;
  username: string | null;
  totalScore: number;
  racesPlayed: number;
  rank: number;
  isCurrentUser: boolean;
}

export interface DashboardLeaderboardPreview {
  leaders: DashboardLeaderboardEntry[];
  currentUserEntry: DashboardLeaderboardEntry | null;
  unavailable: boolean;
}

export interface DashboardLeaguePreviewItem {
  id: string;
  name: string;
  memberCount: number;
  maxUsers: number;
  prizePool: number;
  entryFeeUsdc: number;
  raceId: string | null;
  raceName: string | null;
  raceRound: number | null;
}

export interface DashboardSeasonState {
  totalRounds: number;
  completedRounds: number;
  nextOpenRaceId: string | null;
}

export interface DashboardViewModel {
  profile: DashboardProfile;
  nextRace: DashboardRaceRow | null;
  season: DashboardSeasonState;
  metrics: DashboardMetricState;
  leaderboardPreview: DashboardLeaderboardPreview;
  leaguePreview: DashboardLeaguePreviewItem[];
  schedule: DashboardRaceRow[];
  draftCount: number;
}

export interface DashboardHeroAction {
  href: string;
  label: string;
  helper: string;
  tone: "primary" | "draft" | "quiet";
}

export interface DashboardRaceGroups {
  onDeck: DashboardRaceRow[];
  seasonRun: DashboardRaceRow[];
  settled: DashboardRaceRow[];
}

export interface DashboardSeasonMarker {
  id: string;
  round: number;
  status: "settled" | "next" | "upcoming";
}

const raceFlagsById = new Map(
  staticRaces.map((race) => [
    race.id,
    {
      flag: race.flag,
      country: race.country,
      name: race.name,
    },
  ])
);

export function getRacePresentationMeta(raceId: string) {
  return raceFlagsById.get(raceId) ?? null;
}

export function resolveDashboardHeroAction(
  nextRace: DashboardRaceRow | null
): DashboardHeroAction {
  if (!nextRace) {
    return {
      href: "/leaderboard",
      label: "View Standings",
      helper: "The next live command window will appear here when a round opens.",
      tone: "quiet",
    };
  }

  if (nextRace.predictionStatus === "draft") {
    return {
      href: `/predict/${nextRace.id}`,
      label: "Continue Draft",
      helper: "You are close. Lock the sheet in before qualifying starts.",
      tone: "draft",
    };
  }

  if (nextRace.predictionStatus === "active") {
    return {
      href: `/predict/${nextRace.id}`,
      label: "Edit Prediction",
      helper: "Your sheet is active. Refine it before the window closes.",
      tone: "primary",
    };
  }

  return {
    href: `/predict/${nextRace.id}`,
    label: "Make Prediction",
    helper: "Get on the board before qualifying locks.",
    tone: "primary",
  };
}

export function groupDashboardRaces(races: DashboardRaceRow[]): DashboardRaceGroups {
  const sorted = [...races].sort((a, b) => a.round - b.round);
  const open = sorted.filter((race) => race.raceStatus === "open");
  const settled = sorted.filter((race) => race.raceStatus === "locked");

  return {
    onDeck: open.slice(0, 3),
    seasonRun: open.slice(3),
    settled,
  };
}

export function buildDashboardSeasonMarkers(
  races: DashboardRaceRow[]
): DashboardSeasonMarker[] {
  return [...races]
    .sort((a, b) => a.round - b.round)
    .map((race) => ({
      id: race.id,
      round: race.round,
      status:
        race.raceStatus === "locked"
          ? "settled"
          : race.isNext
            ? "next"
            : "upcoming",
    }));
}

export function formatDashboardRaceDate(date: string | null): string {
  if (!date) {
    return "Schedule pending";
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return "Schedule pending";
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function formatDashboardDateTime(value: string | null): string {
  if (!value) {
    return "Schedule pending";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Schedule pending";
  }

  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDashboardScore(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function formatDashboardCurrency(value: number | null): string {
  if (value === null) {
    return "--";
  }

  return `$${value.toFixed(2)}`;
}

export function formatDashboardRank(value: number | null): string {
  if (value === null) {
    return "Unranked";
  }

  return `P${value}`;
}

export function getDashboardPredictionBadge(
  predictionStatus: DashboardPredictionStatus
): string {
  if (predictionStatus === "draft") {
    return "Draft";
  }

  if (predictionStatus === "active") {
    return "Active";
  }

  return "Not Started";
}

export function getDashboardRaceBadge(race: DashboardRaceRow): string {
  if (race.raceStatus === "locked") {
    return "Locked";
  }

  if (race.predictionStatus === "draft") {
    return "Draft Saved";
  }

  if (race.predictionStatus === "active") {
    return "Ready";
  }

  return "Open";
}

export function getDashboardRaceHref(race: DashboardRaceRow): string {
  if (race.raceStatus === "locked") {
    return `/scores/${race.id}`;
  }

  return `/predict/${race.id}`;
}

export function getDashboardRaceActionLabel(race: DashboardRaceRow): string {
  if (race.raceStatus === "locked") {
    return "View Result";
  }

  if (race.predictionStatus === "draft") {
    return "Continue";
  }

  if (race.predictionStatus === "active") {
    return "Edit";
  }

  return "Predict";
}

export interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  expired: boolean;
}

export function getCountdownParts(
  targetIso: string | null,
  nowMs: number = Date.now()
): CountdownParts {
  if (!targetIso) {
    return {
      days: "--",
      hours: "--",
      minutes: "--",
      seconds: "--",
      expired: false,
    };
  }

  const targetMs = new Date(targetIso).getTime();
  if (Number.isNaN(targetMs)) {
    return {
      days: "--",
      hours: "--",
      minutes: "--",
      seconds: "--",
      expired: false,
    };
  }

  const diff = Math.max(0, targetMs - nowMs);
  const expired = targetMs <= nowMs;
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
    expired,
  };
}
