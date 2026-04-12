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
  // Always null until post-launch pg_cron infrastructure is added.
  // UI hides the indicator when null. Add rank_delta col + cron job post-launch.
  globalRankDelta: number | null;
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
  // Per-league competitive context. Null if data unavailable.
  userRank: number | null;
  // Points gap to the person above the user. Null if user is P1.
  pointsGapToNext: number | null;
  // Points gap from user to P2 below. Populated when user is P1 in the league.
  pointsGapBelow: number | null;
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

// Strips URL prefixes (e.g. https://joingridlock.com/join/CODE) and sanitizes
// to alphanumeric + _ - only. Returns empty string for invalid/empty input.
// Prevents open redirect: the result is always safe to use as a /join/ path segment.
export function extractInviteCode(raw: string): string {
  return raw.trim().replace(/^.*\/join\//, "").replace(/[^a-zA-Z0-9_-]/g, "");
}

export interface LeagueRankContext {
  userRank: number | null;
  pointsGapToNext: number | null;
  pointsGapBelow: number | null;
}

export function computeLeagueRankContext(
  currentUserId: string,
  memberUserIds: string[],
  scoreByUserId: Map<string, number>
): LeagueRankContext {
  if (memberUserIds.length === 0) {
    return { userRank: null, pointsGapToNext: null, pointsGapBelow: null };
  }

  const sorted = memberUserIds
    .map((uid) => ({ uid, score: scoreByUserId.get(uid) ?? 0 }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.uid.localeCompare(b.uid);
    });

  const userIndex = sorted.findIndex((m) => m.uid === currentUserId);
  if (userIndex === -1) {
    return { userRank: null, pointsGapToNext: null, pointsGapBelow: null };
  }

  const userRank = userIndex + 1;
  const userScore = sorted[userIndex].score;
  const pointsGapToNext = userRank > 1 ? sorted[userIndex - 1].score - userScore : null;
  const pointsGapBelow =
    userRank === 1 && sorted.length > 1 ? userScore - sorted[1].score : null;

  return { userRank, pointsGapToNext, pointsGapBelow };
}

export function leagueSubline(league: DashboardLeaguePreviewItem): string {
  if (league.userRank !== null) {
    if (league.userRank === 1) {
      if (league.pointsGapBelow !== null && league.pointsGapBelow > 0) {
        return `P1 · Leading by ${league.pointsGapBelow} pts`;
      }
      // pointsGapBelow === 0 means tied for P1, not sole leader
      if (league.pointsGapBelow === 0) {
        return `P1 · Tied`;
      }
      return `P1 · Sole leader`;
    }
    if (league.pointsGapToNext !== null) {
      if (league.pointsGapToNext === 0) {
        return `P${league.userRank} · Tied`;
      }
      return `P${league.userRank} · ${league.pointsGapToNext} pts behind P${league.userRank - 1}`;
    }
    return `P${league.userRank}`;
  }
  if (league.raceName) {
    return `Next: ${league.raceName}${league.raceRound !== null ? ` · R${league.raceRound}` : ""}`;
  }
  const cap = league.maxUsers > 0 ? `/${league.maxUsers}` : "";
  return `${league.memberCount}${cap} members`;
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

// 1 hero race + 3 upcoming rows = 4 total races shown above the fold in On Deck
const ON_DECK_LIMIT = 4;

export function groupDashboardRaces(races: DashboardRaceRow[]): DashboardRaceGroups {
  const sorted = [...races].sort((a, b) => a.round - b.round);
  const open = sorted.filter((race) => race.raceStatus === "open");
  const settled = sorted.filter((race) => race.raceStatus === "locked");

  return {
    onDeck: open.slice(0, ON_DECK_LIMIT),
    seasonRun: open.slice(ON_DECK_LIMIT),
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
