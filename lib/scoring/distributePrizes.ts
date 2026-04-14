/**
 * Prize distribution engine.
 *
 * Supports:
 * - manual rank-based tiers
 * - skill-weighted proportional payouts
 * - deterministic payout ranking using settlement tie-breakers
 * - optional top-half-only payout restriction
 * - frozen payout holds without reallocating the held amount
 */

import { MINIMUM_LEAGUE_SIZE_FOR_PAYOUT } from "@/lib/gameRules";

const PLATFORM_RAKE_PERCENT = 0.10;
const MIN_RAKE_USDC = 0;
export const MINIMUM_PAID_ENTRANTS = 5;

export type PayoutModel = "manual" | "skill_weighted";
export const DEFAULT_PAYOUT_MODEL: PayoutModel = "manual";

export interface PayoutTier {
  place: number;
  percent: number;
}

export interface LeaguePayoutConfig {
  tiers?: PayoutTier[];
  top_half_only?: boolean;
}

interface RankInput {
  userId: string;
  score: number;
  difficultyScore?: number;
  correctPicks?: number;
  submittedAt?: string | null;
  payoutEligible?: boolean;
  payoutFrozen?: boolean;
}

interface RankedUser {
  userId: string;
  rank: number;
  score: number;
  difficultyScore: number;
  correctPicks: number;
  submittedAt: string | null;
  payoutEligible: boolean;
  payoutFrozen: boolean;
}

interface PayoutAllocation {
  userId: string;
  rank: number;
  amount: number;
  held: boolean;
  is_refund?: boolean;
}

interface DistributionResult {
  leagueId: string;
  model: PayoutModel;
  prizePool: number;
  platformRake: number;
  distributablePool: number;
  payouts: PayoutAllocation[];
  withheldAmount: number;
  undistributed: number;
}

export const DEFAULT_PAYOUT_TIERS: PayoutTier[] = [
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 },
];

export function calculateRake(entryFee: number): { rake: number; netToPool: number } {
  const rake = Math.max(roundUsdc(entryFee * PLATFORM_RAKE_PERCENT), MIN_RAKE_USDC);
  const netToPool = roundUsdc(entryFee - rake);
  return { rake, netToPool };
}

export function rankUsers(scores: RankInput[]): RankedUser[] {
  const sorted = [...scores]
    .map((user) => ({
      userId: user.userId,
      score: user.score,
      difficultyScore: user.difficultyScore ?? 0,
      correctPicks: user.correctPicks ?? 0,
      submittedAt: user.submittedAt ?? null,
      payoutEligible: user.payoutEligible ?? true,
      payoutFrozen: user.payoutFrozen ?? false,
    }))
    .sort(compareRankInputs);

  const ranked: RankedUser[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const previous = i > 0 ? sorted[i - 1] : null;
    const previousRank = i > 0 ? ranked[i - 1].rank : 0;
    const rank =
      previous && haveSamePayoutRank(previous, sorted[i])
        ? previousRank
        : i + 1;

    ranked.push({
      ...sorted[i],
      rank,
    });
  }

  return ranked;
}

export function distributePool(
  leagueId: string,
  prizePool: number,
  rankedUsers: RankedUser[],
  config?: LeaguePayoutConfig | null,
  payoutModel: PayoutModel = DEFAULT_PAYOUT_MODEL
): DistributionResult {
  if (prizePool <= 0 || rankedUsers.length === 0) {
    return {
      leagueId,
      model: payoutModel,
      prizePool,
      platformRake: 0,
      distributablePool: prizePool,
      payouts: [],
      withheldAmount: 0,
      undistributed: Math.max(prizePool, 0),
    };
  }

  // Refund all stakes if league is too small to run a real competition
  if (rankedUsers.length < MINIMUM_LEAGUE_SIZE_FOR_PAYOUT) {
    const refundPerUser = roundUsdc(prizePool / rankedUsers.length);
    return {
      leagueId,
      model: payoutModel,
      prizePool,
      platformRake: 0,
      distributablePool: prizePool,
      payouts: rankedUsers.map((u) => ({
        userId: u.userId,
        rank: 0,
        amount: refundPerUser,
        held: false,
        is_refund: true,
      })),
      withheldAmount: 0,
      undistributed: 0,
    };
  }

  const eligibleRankedUsers = buildEligiblePayoutRanking(rankedUsers, config);
  if (eligibleRankedUsers.length === 0) {
    return {
      leagueId,
      model: payoutModel,
      prizePool,
      platformRake: 0,
      distributablePool: prizePool,
      payouts: [],
      withheldAmount: 0,
      undistributed: roundUsdc(prizePool),
    };
  }

  const basePayouts =
    payoutModel === "skill_weighted"
      ? distributeSkillWeighted(prizePool, eligibleRankedUsers)
      : distributeManual(prizePool, eligibleRankedUsers, config);

  const payouts = basePayouts.map((payout) => {
    const user = eligibleRankedUsers.find((candidate) => candidate.userId === payout.userId);
    return {
      ...payout,
      held: user?.payoutFrozen ?? false,
    };
  });

  const withheldAmount = roundUsdc(
    payouts
      .filter((payout) => payout.held)
      .reduce((sum, payout) => sum + payout.amount, 0)
  );
  const totalAllocated = roundUsdc(payouts.reduce((sum, payout) => sum + payout.amount, 0));

  return {
    leagueId,
    model: payoutModel,
    prizePool,
    platformRake: 0,
    distributablePool: prizePool,
    payouts,
    withheldAmount,
    undistributed: roundUsdc(prizePool - totalAllocated),
  };
}

function buildEligiblePayoutRanking(
  rankedUsers: RankedUser[],
  config?: LeaguePayoutConfig | null
): RankedUser[] {
  const payoutEligible = rankedUsers.filter((user) => user.payoutEligible);
  if (payoutEligible.length === 0) {
    return [];
  }

  const reranked = rankUsers(
    payoutEligible.map((user) => ({
      userId: user.userId,
      score: user.score,
      difficultyScore: user.difficultyScore,
      correctPicks: user.correctPicks,
      submittedAt: user.submittedAt,
      payoutEligible: true,
      payoutFrozen: user.payoutFrozen,
    }))
  );

  if (!config?.top_half_only) {
    return reranked;
  }

  const cutoffRank = Math.ceil(reranked.length / 2);
  return reranked.filter((user) => user.rank <= cutoffRank);
}

function distributeManual(
  prizePool: number,
  rankedUsers: RankedUser[],
  config?: LeaguePayoutConfig | null
): PayoutAllocation[] {
  const tiers = normalizeTiers(config?.tiers ?? DEFAULT_PAYOUT_TIERS);
  if (tiers.length === 0) {
    return [];
  }

  const payouts: PayoutAllocation[] = [];
  const rankGroups = new Map<number, RankedUser[]>();

  for (const user of rankedUsers) {
    const group = rankGroups.get(user.rank) ?? [];
    group.push(user);
    rankGroups.set(user.rank, group);
  }

  for (const [rank, users] of rankGroups.entries()) {
    const startPlace = rank;
    const endPlace = rank + users.length - 1;
    let totalPercent = 0;

    for (const tier of tiers) {
      if (tier.place >= startPlace && tier.place <= endPlace) {
        totalPercent += tier.percent;
      }
    }

    if (totalPercent <= 0) {
      continue;
    }

    const totalForGroupMicros = toMicros((totalPercent / 100) * prizePool);
    const exactPerUserMicros = totalForGroupMicros / users.length;
    const basePerUserMicros = Math.floor(exactPerUserMicros);
    let remainingMicros =
      totalForGroupMicros - basePerUserMicros * users.length;

    const sortedUsers = [...users].sort((a, b) =>
      a.userId.localeCompare(b.userId)
    );

    for (const user of sortedUsers) {
      const userMicros = basePerUserMicros + (remainingMicros > 0 ? 1 : 0);
      if (remainingMicros > 0) {
        remainingMicros -= 1;
      }
      payouts.push({
        userId: user.userId,
        rank: user.rank,
        amount: fromMicros(userMicros),
        held: false,
      });
    }
  }

  return payouts;
}

function distributeSkillWeighted(
  prizePool: number,
  rankedUsers: RankedUser[]
): PayoutAllocation[] {
  const scoringUsers = rankedUsers.filter((user) => user.score > 0);
  if (scoringUsers.length === 0) {
    return [];
  }

  const totalLeagueScore = scoringUsers.reduce((sum, user) => sum + user.score, 0);
  if (totalLeagueScore <= 0) {
    return [];
  }

  const prizePoolMicros = toMicros(prizePool);
  const weighted = scoringUsers.map((user) => {
    const exactMicros = (user.score / totalLeagueScore) * prizePoolMicros;
    const baseMicros = Math.floor(exactMicros);
    return {
      user,
      exactMicros,
      baseMicros,
      remainder: exactMicros - baseMicros,
    };
  });

  let remainingMicros =
    prizePoolMicros - weighted.reduce((sum, entry) => sum + entry.baseMicros, 0);

  weighted.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    if (a.user.rank !== b.user.rank) {
      return a.user.rank - b.user.rank;
    }
    return a.user.userId.localeCompare(b.user.userId);
  });

  for (const entry of weighted) {
    if (remainingMicros <= 0) {
      break;
    }
    entry.baseMicros += 1;
    remainingMicros -= 1;
  }

  return weighted
    .sort((a, b) => {
      if (a.user.rank !== b.user.rank) {
        return a.user.rank - b.user.rank;
      }
      return a.user.userId.localeCompare(b.user.userId);
    })
    .map((entry) => ({
      userId: entry.user.userId,
      rank: entry.user.rank,
      amount: fromMicros(entry.baseMicros),
      held: false,
    }));
}

function normalizeTiers(tiers: PayoutTier[]): PayoutTier[] {
  const filtered = tiers
    .filter((tier) => tier.place >= 1 && tier.percent > 0)
    .sort((a, b) => a.place - b.place);
  const totalPercent = filtered.reduce((sum, tier) => sum + tier.percent, 0);

  if (totalPercent <= 100) {
    return filtered;
  }

  const scale = 100 / totalPercent;
  return filtered.map((tier) => ({
    ...tier,
    percent: tier.percent * scale,
  }));
}

function compareRankInputs(a: Omit<RankedUser, "rank">, b: Omit<RankedUser, "rank">): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  if (b.difficultyScore !== a.difficultyScore) {
    return b.difficultyScore - a.difficultyScore;
  }
  if (b.correctPicks !== a.correctPicks) {
    return b.correctPicks - a.correctPicks;
  }

  const aSubmitted = toSubmittedAtValue(a.submittedAt);
  const bSubmitted = toSubmittedAtValue(b.submittedAt);
  if (aSubmitted !== bSubmitted) {
    return aSubmitted - bSubmitted;
  }

  return a.userId.localeCompare(b.userId);
}

function haveSamePayoutRank(
  a: Omit<RankedUser, "rank">,
  b: Omit<RankedUser, "rank">
): boolean {
  return (
    a.score === b.score &&
    a.difficultyScore === b.difficultyScore &&
    a.correctPicks === b.correctPicks &&
    toSubmittedAtValue(a.submittedAt) === toSubmittedAtValue(b.submittedAt)
  );
}

function toSubmittedAtValue(submittedAt: string | null): number {
  if (!submittedAt) {
    return Number.MAX_SAFE_INTEGER;
  }

  const value = new Date(submittedAt).getTime();
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toMicros(value: number): number {
  return Math.round(value * 1_000_000);
}

function fromMicros(value: number): number {
  return value / 1_000_000;
}
