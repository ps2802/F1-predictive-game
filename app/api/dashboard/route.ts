import { NextResponse } from "next/server";
import {
  buildLeaderboard,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import {
  getRacePresentationMeta,
  type DashboardLeaderboardEntry,
  type DashboardLeaguePreviewItem,
  type DashboardPredictionStatus,
  type DashboardRaceRow,
  type DashboardViewModel,
} from "@/lib/dashboard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DashboardRaceRecord = {
  id: string;
  round: number;
  season: number | null;
  country: string | null;
  race_date: string | null;
  race_starts_at: string | null;
  qualifying_starts_at: string | null;
  grand_prix_name: string | null;
  name: string | null;
  is_locked: boolean | null;
  race_locked: boolean | null;
};

type DashboardPredictionRow = {
  race_id: string;
  status: "draft" | "active";
};

type DashboardScoreRow = {
  user_id: string;
  total_score: number | null;
};

type DashboardLeagueRow = {
  id: string;
  race_id: string | null;
  name: string;
  entry_fee_usdc: number | null;
  prize_pool: number | null;
  member_count: number | null;
  max_users: number | null;
};

function resolveRaceStatus(race: DashboardRaceRecord, now: Date): "open" | "locked" {
  const qualifyingStart =
    race.qualifying_starts_at !== null ? new Date(race.qualifying_starts_at) : null;
  const deadlinePassed =
    qualifyingStart !== null &&
    !Number.isNaN(qualifyingStart.getTime()) &&
    now >= qualifyingStart;

  if (race.is_locked === true || race.race_locked === true || deadlinePassed) {
    return "locked";
  }

  return "open";
}

function getPredictionStatusMap(predictions: DashboardPredictionRow[]) {
  return new Map<string, DashboardPredictionStatus>(
    predictions.map((prediction) => [
      prediction.race_id,
      prediction.status === "draft" ? "draft" : "active",
    ])
  );
}

function buildRanks(scoreRows: DashboardScoreRow[]) {
  const totalsByUser = new Map<string, number>();

  for (const score of scoreRows) {
    totalsByUser.set(
      score.user_id,
      (totalsByUser.get(score.user_id) ?? 0) + Number(score.total_score ?? 0)
    );
  }

  const sortedUsers = [...totalsByUser.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }

    return a[0].localeCompare(b[0]);
  });

  const ranksByUser = new Map<string, number>();
  sortedUsers.forEach(([userId], index) => {
    ranksByUser.set(userId, index + 1);
  });

  return { totalsByUser, ranksByUser };
}

function mapLeaderboardEntry(
  entry: LeaderboardEntry,
  index: number,
  currentUserId: string
): DashboardLeaderboardEntry {
  return {
    userId: entry.user_id,
    username: entry.username,
    totalScore: Number(entry.total_score ?? 0),
    racesPlayed: entry.races_played,
    rank: index + 1,
    isCurrentUser: entry.user_id === currentUserId,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase env vars missing." },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();

  const [
    { data: profile, error: profileError },
    { data: races, error: racesError },
    { data: predictions, error: predictionsError },
    { data: scoreRows, error: scoresError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, balance_usdc, is_admin")
      .eq("id", user.id)
      .single(),
    supabase
      .from("races")
      .select(
        "id, round, season, country, race_date, race_starts_at, qualifying_starts_at, grand_prix_name, name, is_locked, race_locked"
      )
      .order("round", { ascending: true }),
    supabase
      .from("predictions")
      .select("race_id, status")
      .eq("user_id", user.id),
    supabase.from("race_scores").select("user_id, total_score"),
    supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", user.id),
  ]);

  const firstError =
    profileError ??
    racesError ??
    predictionsError ??
    scoresError ??
    membershipsError;

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const raceRows = ((races ?? []) as DashboardRaceRecord[]).filter((race) => {
    if (typeof race.season !== "number") {
      return true;
    }

    return race.season === 2026;
  });

  const predictionStatusByRaceId = getPredictionStatusMap(
    (predictions ?? []) as DashboardPredictionRow[]
  );

  const schedule: DashboardRaceRow[] = raceRows.map((race) => {
    const presentation = getRacePresentationMeta(race.id);
    const raceStatus = resolveRaceStatus(race, now);

    return {
      id: race.id,
      round: race.round,
      name: race.grand_prix_name ?? race.name ?? presentation?.name ?? race.id,
      country: race.country ?? presentation?.country ?? null,
      flag: presentation?.flag ?? null,
      date: race.race_starts_at ?? race.race_date,
      qualifyingStartsAt: race.qualifying_starts_at,
      raceStartsAt: race.race_starts_at,
      raceStatus,
      predictionStatus: predictionStatusByRaceId.get(race.id) ?? "none",
      isNext: false,
    };
  });

  const nextRace = schedule.find((race) => race.raceStatus === "open") ?? null;
  const nextOpenRaceId = nextRace?.id ?? null;
  const scheduleWithNextFlag = schedule.map((race) => ({
    ...race,
    isNext: race.id === nextOpenRaceId,
  }));

  const { totalsByUser, ranksByUser } = buildRanks(
    (scoreRows ?? []) as DashboardScoreRow[]
  );
  const seasonScore = Number(totalsByUser.get(user.id) ?? 0);
  let globalRank = ranksByUser.get(user.id) ?? null;

  const leagueIds = (memberships ?? []).map((membership) => membership.league_id);
  let leaguePreview: DashboardLeaguePreviewItem[] = [];

  if (leagueIds.length > 0) {
    const { data: leagues, error: leaguesError } = await supabase
      .from("leagues")
      .select("id, race_id, name, entry_fee_usdc, prize_pool, member_count, max_users")
      .in("id", leagueIds);

    if (leaguesError) {
      return NextResponse.json({ error: leaguesError.message }, { status: 500 });
    }

    const raceIndexById = new Map(
      scheduleWithNextFlag.map((race, index) => [race.id, index])
    );
    const raceById = new Map(scheduleWithNextFlag.map((race) => [race.id, race]));

    leaguePreview = ((leagues ?? []) as DashboardLeagueRow[])
      .map((league) => {
        const linkedRace = league.race_id ? raceById.get(league.race_id) ?? null : null;

        return {
          id: league.id,
          raceId: league.race_id,
          name: league.name,
          memberCount: Number(league.member_count ?? 0),
          maxUsers: Number(league.max_users ?? 0),
          prizePool: Number(league.prize_pool ?? 0),
          entryFeeUsdc: Number(league.entry_fee_usdc ?? 0),
          raceName: linkedRace?.name ?? null,
          raceRound: linkedRace?.round ?? null,
        };
      })
      .sort((a, b) => {
        const aIndex =
          a.raceId !== null ? (raceIndexById.get(a.raceId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        const bIndex =
          b.raceId !== null ? (raceIndexById.get(b.raceId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;

        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }

        if (b.prizePool !== a.prizePool) {
          return b.prizePool - a.prizePool;
        }

        return a.name.localeCompare(b.name);
      })
      .slice(0, 3);
  }

  let leaderboardLeaders: DashboardLeaderboardEntry[] = [];
  let currentUserEntry: DashboardLeaderboardEntry | null = null;

  if (admin) {
    const [
      { data: allProfiles, error: allProfilesError },
      { data: allScores, error: allScoresError },
      { data: allPredictions, error: allPredictionsError },
    ] = await Promise.all([
      admin.from("profiles").select("id, username, avatar_url"),
      admin.from("race_scores").select("user_id, total_score"),
      admin.from("predictions").select("user_id, race_id"),
    ]);

    const leaderboardError =
      allProfilesError ?? allScoresError ?? allPredictionsError;

    if (!leaderboardError) {
      const entries = buildLeaderboard({
        profiles: allProfiles ?? [],
        scores: allScores ?? [],
        predictions: allPredictions ?? [],
      }).map((entry, index) => mapLeaderboardEntry(entry, index, user.id));
      const fullCurrentUserEntry =
        entries.find((entry) => entry.userId === user.id) ?? null;

      leaderboardLeaders = entries.slice(0, 3);
      globalRank = fullCurrentUserEntry?.rank ?? globalRank;
      currentUserEntry =
        fullCurrentUserEntry !== null && fullCurrentUserEntry.rank > 3
          ? fullCurrentUserEntry
          : null;
    }
  }

  if (currentUserEntry === null && ranksByUser.has(user.id)) {
    const currentRank = globalRank;

    if (
      currentRank !== null &&
      !leaderboardLeaders.some((entry) => entry.userId === user.id)
    ) {
      currentUserEntry = {
        userId: user.id,
        username: profile?.username ?? "You",
        totalScore: seasonScore,
        racesPlayed: (predictions ?? []).length,
        rank: currentRank,
        isCurrentUser: true,
      };
    }
  }

  const viewModel: DashboardViewModel = {
    profile: {
      username: profile?.username ?? null,
      balanceUsdc: profile?.balance_usdc ?? null,
      isAdmin: profile?.is_admin === true,
    },
    nextRace:
      scheduleWithNextFlag.find((race) => race.id === nextOpenRaceId) ?? null,
    season: {
      totalRounds: scheduleWithNextFlag.length,
      completedRounds: scheduleWithNextFlag.filter((race) => race.raceStatus === "locked").length,
      nextOpenRaceId,
    },
    metrics: {
      globalRank,
      seasonScore,
      leaguesJoined: leagueIds.length,
      walletBalance: profile?.balance_usdc ?? null,
    },
    leaderboardPreview: {
      leaders: leaderboardLeaders,
      currentUserEntry,
      unavailable: leaderboardLeaders.length === 0,
    },
    leaguePreview,
    schedule: scheduleWithNextFlag,
    draftCount: (predictions ?? []).filter((prediction) => prediction.status === "draft").length,
  };

  return NextResponse.json(viewModel);
}
