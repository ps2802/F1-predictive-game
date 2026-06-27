"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/components/RaceReplay.module.css";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Public props                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

export interface RaceReplayProps {
  raceId: string;
  raceName: string;
  round: number;
  flag: string | null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Wire shapes — a permissive mirror of /api/scores/[raceId]                    */
/* The route owns the real types; we narrow defensively at the boundary.        */
/* ─────────────────────────────────────────────────────────────────────────── */

interface ScoresComparison {
  question_type: string;
  status: "correct" | "partial" | "wrong" | "unanswered";
  user_picks: string[];
  actual_results: string[];
  points_earned: number;
}

interface ScoresResponse {
  score: { total_score: number } | null;
  rank: number | null;
  comparisons: ScoresComparison[];
}

interface PodiumEntry {
  position: 1 | 2 | 3;
  driver: string;
  /** The user picked this exact driver for this exact podium step. */
  hit: boolean;
}

interface ReplayData {
  podium: PodiumEntry[];
  totalScore: number | null;
  rank: number | null;
  correctHits: number;
}

type LoadPhase = "loading" | "ready" | "minimal" | "error";

const TRACK_TRAVEL_MS = 2200;
const PODIUM_REVEAL_STEP_MS = 260;

/* ─────────────────────────────────────────────────────────────────────────── */
/* Type guards — no `any`, narrow `unknown`                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseComparison(raw: unknown): ScoresComparison | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.question_type !== "string") return null;

  const status =
    record.status === "correct" ||
    record.status === "partial" ||
    record.status === "wrong" ||
    record.status === "unanswered"
      ? record.status
      : "wrong";

  return {
    question_type: record.question_type,
    status,
    user_picks: isStringArray(record.user_picks) ? record.user_picks : [],
    actual_results: isStringArray(record.actual_results) ? record.actual_results : [],
    points_earned: typeof record.points_earned === "number" ? record.points_earned : 0,
  };
}

function parseScoresResponse(raw: unknown): ScoresResponse | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const comparisonsRaw = Array.isArray(record.comparisons) ? record.comparisons : [];
  const comparisons = comparisonsRaw
    .map(parseComparison)
    .filter((entry): entry is ScoresComparison => entry !== null);

  const scoreRecord =
    typeof record.score === "object" && record.score !== null
      ? (record.score as Record<string, unknown>)
      : null;
  const totalScore =
    scoreRecord && typeof scoreRecord.total_score === "number"
      ? scoreRecord.total_score
      : null;

  return {
    score: totalScore !== null ? { total_score: totalScore } : null,
    rank: typeof record.rank === "number" ? record.rank : null,
    comparisons,
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Derive the podium + user hits from the scores comparisons.                    */
/* P1 comes from the `winner` question, P2/P3 from the multi-select `podium`.    */
/* ─────────────────────────────────────────────────────────────────────────── */

function buildReplayData(response: ScoresResponse): ReplayData | null {
  const winner = response.comparisons.find((c) => c.question_type === "winner");
  const podium = response.comparisons.find((c) => c.question_type === "podium");

  const p1 = winner?.actual_results[0] ?? null;
  const p2 = podium?.actual_results[0] ?? null;
  const p3 = podium?.actual_results[1] ?? null;

  if (!p1 && !p2 && !p3) return null;

  const userP1 = winner?.user_picks[0] ?? null;
  const userPodium = podium?.user_picks ?? [];

  const entries: PodiumEntry[] = [];
  if (p1) entries.push({ position: 1, driver: p1, hit: userP1 === p1 });
  // Podium picks are unordered (P2/P3 set) — a hit is membership, not order.
  if (p2) entries.push({ position: 2, driver: p2, hit: userPodium.includes(p2) });
  if (p3) entries.push({ position: 3, driver: p3, hit: userPodium.includes(p3) });

  return {
    podium: entries,
    totalScore: response.score?.total_score ?? null,
    rank: response.rank,
    correctHits: entries.filter((entry) => entry.hit).length,
  };
}

function lastName(driver: string): string {
  const parts = driver.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : driver;
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  // Lazy initializer reads the current preference once — no synchronous
  // setState in an effect (which triggers cascading renders).
  const [reduced, setReduced] = useState<boolean>(() => readReducedMotion());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Component                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function RaceReplay({ raceId, raceName, round, flag }: RaceReplayProps): React.ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [data, setData] = useState<ReplayData | null>(null);

  // Animation state: 0 → 1 lane progress, then how many podium slots revealed.
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [runToken, setRunToken] = useState(0);

  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);

  // ── Fetch the most recent settled race's scores (lazy, this component only) ──
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load(): Promise<void> {
      try {
        const response = await fetch(`/api/scores/${raceId}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        // 404 = the user has no score row for this race (didn't play / not yet
        // scored for them). Degrade to a minimal "results posted" recap.
        if (response.status === 404) {
          if (!cancelled) setPhase("minimal");
          return;
        }

        if (!response.ok) {
          if (!cancelled) setPhase("minimal");
          return;
        }

        const payload: unknown = await response.json();
        const parsed = parseScoresResponse(payload);
        const replay = parsed ? buildReplayData(parsed) : null;

        if (cancelled) return;

        if (replay) {
          setData(replay);
          setPhase("ready");
        } else {
          setPhase("minimal");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        // Network failure should not break the dashboard — degrade quietly.
        if (!cancelled) setPhase("minimal");
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("RaceReplay scores fetch failed", error);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [raceId]);

  const podiumCount = data?.podium.length ?? 0;

  // ── Drive the lane-travel + podium reveal animation ─────────────────────────
  // All state writes happen inside async callbacks (rAF / setTimeout), never
  // synchronously in the effect body — avoids cascading renders.
  useEffect(() => {
    // Only animate a settled-race replay, and only when motion is allowed.
    // Reduced motion renders the final classification directly (see below).
    if (phase !== "ready" || reducedMotion || podiumCount === 0) return;

    function clearTimers(): void {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
    }

    let startTs: number | null = null;
    let didReset = false;

    function tick(now: number): void {
      // First frame resets the lane to the start line.
      if (!didReset) {
        didReset = true;
        setProgress(0);
        setRevealed(0);
      }

      // Pause while the tab is hidden — freeze the cars mid-lane.
      if (typeof document !== "undefined" && document.hidden) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (startTs === null) startTs = now;
      const elapsed = now - startTs;
      const next = Math.min(1, elapsed / TRACK_TRAVEL_MS);
      setProgress(next);

      if (next < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Cars reached the line — reveal the podium step by step.
      for (let step = 1; step <= podiumCount; step += 1) {
        const id = window.setTimeout(() => {
          setRevealed(step);
        }, step * PODIUM_REVEAL_STEP_MS);
        timersRef.current.push(id);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return clearTimers;
  }, [phase, reducedMotion, podiumCount, runToken]);

  const onReplay = (): void => {
    if (reducedMotion) return;
    setRunToken((token) => token + 1);
  };

  const headerRound = (
    <span className={styles.roundTag}>
      {flag ? `${flag} ` : ""}Round {round}
    </span>
  );

  /* ── Pre-season / no settled race handled by parent; here we render states ── */

  if (phase === "loading") {
    return <ReplaySkeleton />;
  }

  if (phase === "minimal") {
    return (
      <section className={styles.panel} aria-label="Race replay">
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Latest Result</div>
            <div className={styles.title}>{raceName}</div>
          </div>
          <div className={styles.headerRight}>{headerRound}</div>
        </div>
        <div className={styles.body}>
          <p className={styles.resultLine}>
            Results are in for the {raceName}. Open the scorecard for the full classification.
          </p>
          <div className={styles.footer}>
            <span className={styles.resultLine}>Round {round} · Settled</span>
            <Link href={`/scores/${raceId}`} className={styles.viewLink}>
              View Scorecard →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (phase === "error" || data === null) {
    return <ReplaySkeleton />;
  }

  // Reduced motion renders the final classification directly (no animation
  // state); otherwise we use the rAF-driven progress/reveal state.
  const effectiveProgress = reducedMotion ? 1 : progress;
  const effectiveRevealed = reducedMotion ? podiumCount : revealed;
  const animationComplete = effectiveRevealed >= podiumCount;
  const laneWidth = `${Math.round(effectiveProgress * 100)}%`;

  return (
    <section className={styles.panel} aria-label="Race replay">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Race Replay</div>
          <div className={styles.title}>{raceName}</div>
        </div>
        <div className={styles.headerRight}>
          {headerRound}
          {!reducedMotion && (
            <button
              type="button"
              className={styles.replayButton}
              onClick={onReplay}
              disabled={!animationComplete}
            >
              ↻ Replay
            </button>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {/* Track + travelling cars */}
        <div className={styles.track} aria-hidden="true">
          <div className={styles.trackFill} style={{ width: laneWidth }} />
        </div>
        <div className={styles.laneLabels} aria-hidden="true">
          <span>Lights Out</span>
          <span>Chequered Flag</span>
        </div>

        <div className={styles.carLane} aria-hidden="true">
          {data.podium.map((entry, index) => {
            // Stagger finishing positions: P1 leads, P3 trails slightly.
            const lead = 1 - index * 0.08;
            const left = `${Math.min(98, Math.max(2, effectiveProgress * 100 * lead))}%`;
            const top = `${index * 26}px`;
            const carClasses = [
              styles.car,
              entry.position === 1 ? styles.carP1 : "",
              entry.hit ? styles.carHit : "",
              entry.hit && animationComplete ? styles.carHitPulse : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={entry.driver} className={carClasses} style={{ left, top }}>
                <span className={styles.carDot} />
                <span className={styles.carName}>{lastName(entry.driver)}</span>
                <span className={styles.carPos}>P{entry.position}</span>
              </div>
            );
          })}
        </div>

        {/* Podium reveal */}
        <div className={styles.podium}>
          {data.podium.map((entry, index) => {
            const shown = index < effectiveRevealed;
            const posClass =
              entry.position === 1
                ? styles.podiumPosP1
                : entry.position === 2
                  ? styles.podiumPosP2
                  : styles.podiumPosP3;
            return (
              <div
                key={entry.driver}
                className={`${styles.podiumSlot} ${shown ? styles.podiumSlotShown : ""}`}
              >
                <span className={`${styles.podiumPos} ${posClass}`}>P{entry.position}</span>
                <span className={styles.podiumDriver}>{entry.driver}</span>
                {entry.hit ? (
                  <span className={styles.podiumHit}>● Nailed it</span>
                ) : (
                  <span className={styles.podiumMiss}>Missed</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Result line */}
        <div className={styles.footer}>
          <span className={styles.resultLine}>
            {data.correctHits > 0 ? (
              <>
                You called <strong>{data.correctHits}</strong> of the podium right
                {data.rank !== null ? ` · P${data.rank} this round` : ""}
              </>
            ) : data.rank !== null ? (
              <>Finished P{data.rank} on this round</>
            ) : (
              <>Podium settled — better luck next round</>
            )}
          </span>
          {data.totalScore !== null && (
            <span className={styles.resultScore}>
              <span className={styles.resultScoreValue}>
                {Number.isInteger(data.totalScore) ? data.totalScore : data.totalScore.toFixed(1)}
              </span>
              <span className={styles.resultScoreLabel}>pts</span>
            </span>
          )}
        </div>

        <span className={styles.srOnly}>
          Final classification for {raceName}:{" "}
          {data.podium.map((entry) => `P${entry.position} ${entry.driver}`).join(", ")}.
        </span>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Skeleton — also exported for the dynamic() loading fallback                  */
/* ─────────────────────────────────────────────────────────────────────────── */

export function ReplaySkeleton(): React.ReactElement {
  return <div className={styles.skeleton} aria-hidden="true" />;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Pre-season placeholder — exported so the parent can render it without        */
/* pulling in the animated bundle when there is no settled race yet.            */
/* ─────────────────────────────────────────────────────────────────────────── */

export function RaceReplayPlaceholder(): React.ReactElement {
  return (
    <section className={styles.panel} aria-label="Race replay">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Race Replay</div>
          <div className={styles.title}>Locked</div>
        </div>
      </div>
      <div className={styles.placeholder}>
        <div className={styles.placeholderTitle}>Your first race replay unlocks after Round 1</div>
        <div className={styles.placeholderSub}>
          Lock a podium, watch the lights go out, and see how your call held up.
        </div>
      </div>
    </section>
  );
}
