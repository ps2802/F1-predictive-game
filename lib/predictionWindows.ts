import { PRE_LOCK_BUFFER_MINUTES } from "./gameRules";

export type PredictionSession = "qualifying" | "race";

/**
 * A weekend has ONE lock at the start of its first competitive session. Picks
 * are freely editable until then; after lock they are final (read-only). There
 * is no paid edit window — Gridlock is free.
 */
export type PredictionWindowState = {
  session: PredictionSession;
  editable: boolean;
  locked: boolean;
  lockAt: string | null;
};

type RaceTimingInput = {
  /** Start of the first competitive session covering the whole weekend. */
  lock_time_utc?: string | null;
  qualifying_starts_at?: string | null;
  race_starts_at?: string | null;
  quali_locked?: boolean | null;
  race_locked?: boolean | null;
};

/**
 * Resolves the editability window for a session. The lock anchor is the start
 * of the first competitive session (lock_time_utc), falling back to qualifying
 * then race start when the canonical lock time is not yet populated. A single
 * lock applies to every category, so both sessions share the same anchor.
 */
export function resolvePredictionWindow(
  race: RaceTimingInput,
  session: PredictionSession,
  now = new Date()
): PredictionWindowState {
  const startAt =
    race.lock_time_utc ?? race.qualifying_starts_at ?? race.race_starts_at ?? null;
  const manuallyLocked =
    race.quali_locked === true || race.race_locked === true;

  if (!startAt) {
    return {
      session,
      editable: !manuallyLocked,
      locked: manuallyLocked,
      lockAt: null,
    };
  }

  const startMs = new Date(startAt).getTime();
  const lockMs = startMs - PRE_LOCK_BUFFER_MINUTES * 60 * 1000;
  const nowMs = now.getTime();
  const locked = manuallyLocked || nowMs >= lockMs;

  return {
    session,
    editable: !locked,
    locked,
    lockAt: new Date(lockMs).toISOString(),
  };
}

export function formatCountdown(targetIso: string | null, now = new Date()): string {
  if (!targetIso) return "TBD";
  const diffMs = new Date(targetIso).getTime() - now.getTime();
  if (diffMs <= 0) return "Now";

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
