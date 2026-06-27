export type LeaderboardProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export type LeaderboardScoreRow = {
  user_id: string;
  total_score: number | null;
};

export type LeaderboardPredictionRow = {
  user_id: string;
  race_id: string;
};

export type LeaderboardEntry = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  total_score: number;
  races_played: number;
};

export function buildLeaderboard(params: {
  profiles: LeaderboardProfile[];
  scores: LeaderboardScoreRow[];
  predictions: LeaderboardPredictionRow[];
}): LeaderboardEntry[] {
  const { profiles, scores, predictions } = params;
  const totalsByUser = new Map<string, number>();
  const racesByUser = new Map<string, Set<string>>();

  for (const score of scores) {
    totalsByUser.set(
      score.user_id,
      (totalsByUser.get(score.user_id) ?? 0) + Number(score.total_score ?? 0)
    );
  }

  for (const prediction of predictions) {
    const races = racesByUser.get(prediction.user_id) ?? new Set<string>();
    races.add(prediction.race_id);
    racesByUser.set(prediction.user_id, races);
  }

  return profiles
    .map((profile) => ({
      user_id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      total_score: totalsByUser.get(profile.id) ?? 0,
      races_played: racesByUser.get(profile.id)?.size ?? 0,
    }))
    .sort((a, b) => {
      if (b.total_score !== a.total_score) {
        return b.total_score - a.total_score;
      }

      if (b.races_played !== a.races_played) {
        return b.races_played - a.races_played;
      }

      return a.user_id.localeCompare(b.user_id);
    });
}
