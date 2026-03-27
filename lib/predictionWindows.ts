import {
  PAID_EDIT_WINDOW_MINUTES,
  PRE_LOCK_BUFFER_MINUTES,
} from "./gameRules";

export type PredictionSession = "qualifying" | "race";

export type PredictionWindowState = {
  session: PredictionSession;
  editable: boolean;
  paidEdit: boolean;
  locked: boolean;
  lockAt: string | null;
  paidEditClosesAt: string | null;
};

type RaceTimingInput = {
  qualifying_starts_at?: string | null;
  race_starts_at?: string | null;
  quali_locked?: boolean | null;
  race_locked?: boolean | null;
};

export function resolvePredictionWindow(
  race: RaceTimingInput,
  session: PredictionSession,
  now = new Date()
): PredictionWindowState {
  const startAt =
    session === "qualifying" ? race.qualifying_starts_at ?? null : race.race_starts_at ?? null;
  const manuallyLocked =
    session === "qualifying" ? race.quali_locked === true : race.race_locked === true;

  if (!startAt) {
    return {
      session,
      editable: !manuallyLocked,
      paidEdit: false,
      locked: manuallyLocked,
      lockAt: null,
      paidEditClosesAt: null,
    };
  }

  const startMs = new Date(startAt).getTime();
  const lockMs = startMs - PRE_LOCK_BUFFER_MINUTES * 60 * 1000;
  const paidEditCloseMs = startMs + PAID_EDIT_WINDOW_MINUTES * 60 * 1000;
  const nowMs = now.getTime();

  const preLockOpen = nowMs < lockMs;
  const paidEditOpen = nowMs >= lockMs && nowMs <= paidEditCloseMs;
  const locked = manuallyLocked || nowMs > paidEditCloseMs;

  return {
    session,
    editable: !manuallyLocked && (preLockOpen || paidEditOpen),
    paidEdit: !manuallyLocked && paidEditOpen,
    locked,
    lockAt: new Date(lockMs).toISOString(),
    paidEditClosesAt: new Date(paidEditCloseMs).toISOString(),
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
