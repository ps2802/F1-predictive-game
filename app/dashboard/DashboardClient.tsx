"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppNav } from "@/app/components/AppNav";
import { track } from "@/lib/analytics";
import {
  buildDashboardSeasonMarkers,
  formatDashboardCurrency,
  formatDashboardDateTime,
  formatDashboardRaceDate,
  formatDashboardRank,
  formatDashboardScore,
  getCountdownParts,
  getDashboardPredictionBadge,
  getDashboardRaceActionLabel,
  getDashboardRaceBadge,
  getDashboardRaceHref,
  groupDashboardRaces,
  leagueSubline,
  resolveDashboardHeroAction,
  type CountdownParts,
  type DashboardLeaderboardEntry,
  type DashboardLeaguePreviewItem,
  type DashboardRaceRow,
  type DashboardViewModel,
} from "@/lib/dashboard";
import styles from "@/app/dashboard/DashboardPage.module.css";

/* ─── CSS tokens (inline, matches preview-b palette) ─── */
const R = "#E10600";
const TEAL = "#00D2AA";
const PANEL = "#0D0D0D";
const BORDER = "rgba(255,255,255,0.07)";

type LoadState = {
  error: string;
  loading: boolean;
  viewModel: DashboardViewModel | null;
};

export default function DashboardClient() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>({
    error: "",
    loading: true,
    viewModel: null,
  });
  const [settledOpen, setSettledOpen] = useState(false);
  const [countdownNow, setCountdownNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setState((current) => ({ ...current, error: "", loading: true }));

      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const payload = (await response.json()) as DashboardViewModel & { error?: string };

        if (response.status === 401) { router.push("/login"); return; }
        if (!response.ok) throw new Error(payload.error ?? "Failed to load dashboard.");

        if (!cancelled) {
          setState({ error: "", loading: false, viewModel: payload });
          track("dashboard_viewed", {
            draft_count: payload.draftCount,
            leagues_joined: payload.metrics.leaguesJoined,
            next_race_round: payload.nextRace?.round,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            error: error instanceof Error ? error.message : "Failed to load dashboard.",
            loading: false,
            viewModel: null,
          });
        }
      }
    }

    void loadDashboard();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (state.loading) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav />
        <DashboardSkeleton />
      </div>
    );
  }

  if (state.error || state.viewModel === null) {
    return (
      <div className="gla-root">
        <div className="gl-stripe" aria-hidden="true" />
        <AppNav />
        <div className={styles.viewport}>
          <section className={styles.errorPanel}>
            <p className={styles.panelEyebrow}>Dashboard Offline</p>
            <h1 className={styles.errorTitle}>Race control failed to boot.</h1>
            <p className={styles.errorCopy}>{state.error || "Refresh and try again."}</p>
            <button className={styles.errorButton} onClick={() => window.location.reload()}>
              Retry
            </button>
          </section>
        </div>
      </div>
    );
  }

  const grouped = groupDashboardRaces(state.viewModel.schedule);
  const seasonMarkers = buildDashboardSeasonMarkers(state.viewModel.schedule);
  const vm = state.viewModel;

  return (
    <div className="gla-root">
      <div className="gl-stripe" aria-hidden="true" />
      <AppNav
        profile={{
          username: vm.profile.username,
          balance_usdc: vm.profile.balanceUsdc,
          is_admin: vm.profile.isAdmin,
        }}
      />

      {/* narrow viewport matches preview-b */}
      <div className={styles.viewport} style={{ maxWidth: "min(960px, calc(100% - 40px))", padding: "36px 0 100px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* ① Hero — next race */}
          <HeroCard race={vm.nextRace} nowMs={countdownNow} draftCount={vm.draftCount} />

          {/* ② Action strip — 3 tiles */}
          <ActionStrip metrics={vm.metrics} nextRace={vm.nextRace} />

          {/* ③ My Leagues */}
          <MyLeaguesSection leagues={vm.leaguePreview} />

          {/* ④ Standings + Race schedule side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <StandingsWidget leaderboard={vm.leaderboardPreview} metrics={vm.metrics} />
            <OnDeckWidget
              groups={grouped}
              settledOpen={settledOpen}
              setSettledOpen={setSettledOpen}
              markers={seasonMarkers}
              season={vm.season}
            />
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Hero card                                                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function HeroCard({
  draftCount,
  nowMs,
  race,
}: {
  draftCount: number;
  nowMs: number;
  race: DashboardRaceRow | null;
}) {
  const action = resolveDashboardHeroAction(race);
  const countdown = getCountdownParts(race?.qualifyingStartsAt ?? null, nowMs);

  if (race === null) {
    return (
      <div style={heroWrap}>
        <div style={heroInner}>
          <div>
            <p style={heroStep}>Season Status</p>
            <h1 style={heroName}>Season Complete</h1>
            <p style={heroMeta}>All rounds are done. Final standings are live.</p>
          </div>
          <div style={heroCta}>
            <Link href="/leaderboard" style={btnHero}>Final Standings →</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={heroWrap}>
      <div style={heroInner}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <span style={heroStep}>
            Your next move · Round {race.round}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ fontSize: "42px", lineHeight: 1 }}>{race.flag ?? "🏁"}</span>
            <h1 style={heroName}>{race.name}</h1>
          </div>
          <p style={heroMeta}>
            {race.country ?? "Grand Prix"}
            {race.date ? ` · ${formatDashboardRaceDate(race.date)}` : ""}
            {" · "}
            {getDashboardPredictionBadge(race.predictionStatus)}
          </p>

          {/* Countdown */}
          <CountdownRow countdown={countdown} />

          {race.qualifyingStartsAt && (
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.36)", marginTop: "2px" }}>
              Qualifying locks {formatDashboardDateTime(race.qualifyingStartsAt)}
            </p>
          )}
        </div>

        <div style={heroCta}>
          <Link
            href={action.href}
            style={btnHero}
            data-testid={race.isNext ? "dashboard-open-predict-button" : undefined}
          >
            {action.label}
          </Link>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
            One prediction · Every league
          </span>
          {draftCount > 0 && (
            <span style={{ fontSize: "10px", color: TEAL, textAlign: "center" }}>
              {draftCount} draft{draftCount > 1 ? "s" : ""} pending
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CountdownRow({ countdown }: { countdown: CountdownParts }) {
  const parts = [
    { label: "d", value: countdown.days, red: true },
    { label: "h", value: countdown.hours, red: false },
    { label: "m", value: countdown.minutes, red: false },
    { label: "s", value: countdown.seconds, red: false },
  ];

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "2px", marginTop: "4px" }}>
      {parts.map((p, i) => (
        <span key={p.label} style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
          {i > 0 && (
            <span style={{ fontSize: "28px", fontWeight: 200, color: "rgba(255,255,255,0.14)", paddingBottom: "4px" }}>:</span>
          )}
          <span style={{
            fontSize: "clamp(28px,4vw,42px)",
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: "-0.06em",
            fontVariantNumeric: "tabular-nums",
            color: p.red ? R : "#fff",
            textShadow: p.red ? `0 0 20px rgba(225,6,0,0.4)` : "none",
          }}>
            {String(p.value).padStart(2, "0")}
          </span>
          <span style={{
            fontSize: "9px", fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
            color: "rgba(255,255,255,0.32)", margin: "0 6px 0 2px", alignSelf: "flex-end", paddingBottom: "6px",
          }}>
            {p.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/* hero styles */
const heroWrap: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  padding: "36px 40px 32px",
  border: `1px solid rgba(225,6,0,0.3)`,
  background: "linear-gradient(135deg, rgba(225,6,0,0.12) 0%, rgba(255,255,255,0.02) 60%)",
};

const heroInner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "40px",
};

const heroStep: React.CSSProperties = {
  fontSize: "9px", fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase",
  color: "rgba(225,6,0,0.7)", margin: 0,
};

const heroName: React.CSSProperties = {
  fontSize: "clamp(28px,4.5vw,52px)",
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: "-0.04em",
  textTransform: "uppercase",
  color: "#fff",
  margin: 0,
};

const heroMeta: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "rgba(255,255,255,0.38)", margin: 0,
};

const heroCta: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "10px",
};

const btnHero: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: "200px", height: "56px",
  fontSize: "13px", fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase",
  color: "#fff", background: R, textDecoration: "none",
  boxShadow: `0 0 0 1px rgba(225,6,0,0.7), 0 6px 32px rgba(225,6,0,0.45)`,
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Action strip — 3 tiles                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

function ActionStrip({
  metrics,
  nextRace,
}: {
  metrics: DashboardViewModel["metrics"];
  nextRace: DashboardRaceRow | null;
}) {
  const tiles = [
    {
      href: "/wallet",
      label: formatDashboardCurrency(metrics.walletBalance),
      labelTeal: true,
      sub: `${formatDashboardCurrency(metrics.walletBalance)} in wallet · Deposit USDC`,
      arrowTeal: true,
    },
    {
      href: "/leagues/create",
      label: "Create League",
      labelTeal: false,
      sub: "Set rules, entry fee, invite friends",
      arrowTeal: false,
    },
    {
      href: "/leaderboard",
      label: "Global Standings",
      labelTeal: false,
      sub: metrics.globalRank
        ? `You're #${formatDashboardRank(metrics.globalRank)} · ${formatDashboardScore(metrics.seasonScore)} pts this season`
        : nextRace
          ? `Score a race to rank · ${formatDashboardScore(metrics.seasonScore)} pts`
          : "Check the final standings",
      arrowTeal: false,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
      {tiles.map((t) => (
        <Link key={t.href} href={t.href} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
          padding: "16px 18px",
          border: `1px solid ${BORDER}`,
          background: PANEL,
          textDecoration: "none", color: "inherit",
          borderRadius: 0,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{
              fontSize: "14px", fontWeight: 800, letterSpacing: "-0.02em",
              color: t.labelTeal ? TEAL : "#fff",
            }}>
              {t.label}
            </span>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.42)" }}>{t.sub}</span>
          </div>
          <span style={{ fontSize: "18px", color: t.arrowTeal ? `rgba(0,210,170,0.5)` : "rgba(255,255,255,0.24)", flexShrink: 0 }}>→</span>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* My Leagues section                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

function MyLeaguesSection({ leagues }: { leagues: DashboardLeaguePreviewItem[] }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, background: PANEL, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div>
          <div style={sectionLabel}>Competition</div>
          <div style={sectionTitle}>My Leagues</div>
        </div>
        <Link href="/leagues" style={sectionAction} data-testid="dashboard-my-leagues">
          Browse All →
        </Link>
      </div>

      {/* League rows */}
      {leagues.length === 0 ? (
        <div style={{ padding: "24px 20px", textAlign: "center" }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", margin: "0 0 12px" }}>
            No leagues yet — join or create one.
          </p>
          <Link href="/leagues/create" style={{
            display: "inline-flex", alignItems: "center", height: "32px", padding: "0 16px",
            background: R, fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "#fff", textDecoration: "none",
          }}>
            + Create League
          </Link>
        </div>
      ) : (
        leagues.map((league) => (
          <Link key={league.id} href={`/leagues/${league.id}`} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto",
            alignItems: "center", gap: "16px",
            padding: "14px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            textDecoration: "none", color: "inherit",
          }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700 }}>{league.name}</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.38)", marginTop: "2px" }}>
                {leagueSubline(league)}
              </div>
            </div>
            {league.prizePool > 0 && (
              <span style={{ fontSize: "13px", fontWeight: 900, color: TEAL, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                {formatDashboardCurrency(league.prizePool)}
              </span>
            )}
            <span style={{
              display: "inline-flex", alignItems: "center", height: "28px", padding: "0 12px",
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
              fontSize: "9px", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase",
              color: "rgba(255,255,255,0.6)",
            }}>
              View
            </span>
          </Link>
        ))
      )}

      {/* Join-code row */}
      <JoinRow />
    </div>
  );
}

function JoinRow() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "14px 20px",
      borderTop: "1px solid rgba(255,255,255,0.05)",
      background: "rgba(255,255,255,0.015)",
    }}>
      <span style={{
        fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.36)", whiteSpace: "nowrap",
      }}>
        Have a code?
      </span>
      <form
        style={{ flex: 1, display: "flex", gap: "8px" }}
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const input = form.elements.namedItem("code") as HTMLInputElement;
          // Strip any URL prefix — only the alphanumeric code matters.
          const raw = input.value.trim();
          const code = raw.replace(/^.*\/join\//, "").replace(/[^a-zA-Z0-9_-]/g, "");
          if (code) window.location.href = `/join/${code}`;
        }}
      >
        <input
          name="code"
          placeholder="Paste invite link or enter code"
          style={{
            flex: 1, height: "34px", padding: "0 12px",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff", fontFamily: "inherit", fontSize: "12px",
            letterSpacing: "0.06em", textTransform: "uppercase",
            outline: "none",
          }}
        />
        <button type="submit" style={{
          height: "34px", padding: "0 16px",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          fontSize: "10px", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.7)", fontFamily: "inherit", cursor: "pointer",
        }}>
          Join
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Standings widget                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

function StandingsWidget({
  leaderboard,
  metrics,
}: {
  leaderboard: DashboardViewModel["leaderboardPreview"];
  metrics: DashboardViewModel["metrics"];
}) {
  const youEntry = leaderboard.currentUserEntry;
  const topInLeaders = leaderboard.leaders.some((e) => e.isCurrentUser);

  return (
    <div style={{ border: `1px solid ${BORDER}`, background: PANEL, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div>
          <div style={sectionLabel}>Gridlock</div>
          <div style={sectionTitle}>Standings</div>
        </div>
        <Link href="/leaderboard" style={sectionAction}>Full board →</Link>
      </div>

      {leaderboard.leaders.length === 0 ? (
        <div style={{ padding: "24px 20px", color: "rgba(255,255,255,0.38)", fontSize: "12px" }}>
          First race results coming soon.
        </div>
      ) : (
        <>
          {leaderboard.leaders.map((entry) => (
            <PodiumRow key={entry.userId} entry={entry} isYou={entry.isCurrentUser} />
          ))}

          {youEntry !== null && !topInLeaders && (
            <>
              <div style={{
                fontSize: "9px", fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase",
                color: "rgba(255,255,255,0.24)", padding: "8px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}>
                Your position
              </div>
              <PodiumRow entry={youEntry} isYou={true} />
            </>
          )}

          {youEntry === null && metrics.seasonScore === 0 && (
            <div style={{
              padding: "12px 14px", fontSize: "11px",
              color: "rgba(255,255,255,0.35)", borderTop: "1px solid rgba(255,255,255,0.04)",
            }}>
              Score a race to appear on the board.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PodiumRow({ entry, isYou }: { entry: DashboardLeaderboardEntry; isYou: boolean }) {
  const pos = entry.rank;
  const rankColor = pos === 1 ? "#ffd700" : pos === 2 ? "#c0c8d0" : pos === 3 ? "#c87533" : "rgba(255,255,255,0.4)";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "36px 1fr auto",
      alignItems: "center", gap: "10px",
      padding: "10px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      borderLeft: isYou ? `2px solid ${R}` : undefined,
      background: isYou ? `rgba(225,6,0,0.06)` : undefined,
    }}>
      <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: rankColor }}>
        P{pos}
      </span>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 700 }}>
          {isYou ? "You" : (entry.username ?? "Anonymous")}
        </div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.36)", marginTop: "1px" }}>
          {entry.racesPlayed} race{entry.racesPlayed !== 1 ? "s" : ""}
        </div>
      </div>
      <span style={{ fontSize: "18px", fontWeight: 900, letterSpacing: "-0.05em" }}>
        {formatDashboardScore(entry.totalScore)}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* On-deck / upcoming races (right panel next to standings)                    */
/* ─────────────────────────────────────────────────────────────────────────── */

function OnDeckWidget({
  groups,
  settledOpen,
  setSettledOpen,
  markers,
  season,
}: {
  groups: ReturnType<typeof groupDashboardRaces>;
  settledOpen: boolean;
  setSettledOpen: (v: boolean) => void;
  markers: ReturnType<typeof buildDashboardSeasonMarkers>;
  season: DashboardViewModel["season"];
}) {
  const pct = season.totalRounds > 0
    ? Math.round((season.completedRounds / season.totalRounds) * 100)
    : 0;

  return (
    <div style={{ border: `1px solid ${BORDER}`, background: PANEL, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div>
          <div style={sectionLabel}>2026 Season · {pct}%</div>
          <div style={sectionTitle}>Race Calendar</div>
        </div>
        <Link href="/dashboard#schedule" style={sectionAction}>Full calendar →</Link>
      </div>

      {/* Season progress bar */}
      <div style={{ padding: "10px 20px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ height: "3px", background: "rgba(255,255,255,0.08)", marginBottom: "10px" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: R, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "10px" }}>
          {markers.slice(0, 14).map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flexShrink: 0 }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: m.status === "settled" ? "rgba(255,255,255,0.25)"
                  : m.status === "next" ? R
                    : "rgba(255,255,255,0.1)",
                boxShadow: m.status === "next" ? `0 0 6px ${R}` : undefined,
              }} />
              <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontWeight: m.status === "next" ? 800 : 400 }}>
                R{m.round}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* On deck races */}
      {groups.onDeck.map((race) => (
        <Link key={race.id} href={getDashboardRaceHref(race)} style={{
          display: "grid", gridTemplateColumns: "28px 1fr auto",
          alignItems: "center", gap: "10px",
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          textDecoration: "none", color: "inherit",
        }}>
          <span style={{ fontSize: "10px", fontWeight: 800, color: "rgba(255,255,255,0.3)" }}>
            R{race.round}
          </span>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700 }}>
              {race.flag ?? "🏁"} {race.name}
            </div>
            <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.38)", marginTop: "1px" }}>
              {race.date ? formatDashboardRaceDate(race.date) : "Date TBD"}
            </div>
          </div>
          <span style={{
            fontSize: "9px", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase",
            color: race.isNext ? R : "rgba(255,255,255,0.36)",
          }}>
            {getDashboardRaceActionLabel(race)}
          </span>
        </Link>
      ))}

      {/* Settled toggle */}
      {groups.settled.length > 0 && (
        <button
          type="button"
          onClick={() => setSettledOpen(!settledOpen)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "10px 14px",
            background: "none", border: "none", borderTop: "1px solid rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.32)", cursor: "pointer", fontFamily: "inherit",
            fontSize: "9px", fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase",
          }}
        >
          <span>Settled · {groups.settled.length} rounds</span>
          <span style={{ transition: "transform 0.2s", transform: settledOpen ? "rotate(90deg)" : "none" }}>›</span>
        </button>
      )}

      {settledOpen && groups.settled.slice(0, 5).map((race) => (
        <Link key={race.id} href={getDashboardRaceHref(race)} style={{
          display: "grid", gridTemplateColumns: "28px 1fr auto",
          alignItems: "center", gap: "10px",
          padding: "8px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.03)",
          textDecoration: "none", color: "inherit",
          opacity: 0.6,
        }}>
          <span style={{ fontSize: "9px", fontWeight: 800, color: "rgba(255,255,255,0.3)" }}>R{race.round}</span>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>{race.flag ?? "🏁"} {race.name}</div>
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.36)", fontWeight: 700 }}>Done</span>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Shared label styles                                                          */
/* ─────────────────────────────────────────────────────────────────────────── */

const sectionLabel: React.CSSProperties = {
  fontSize: "9px", fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase",
  color: "rgba(255,255,255,0.32)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "16px", fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase",
  marginTop: "6px", color: "#fff",
};

const sectionAction: React.CSSProperties = {
  fontSize: "9px", fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase",
  color: "rgba(0,210,170,0.6)", textDecoration: "none",
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Skeleton                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

function DashboardSkeleton() {
  const shimmer: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    animation: "pulse 1.6s ease-in-out infinite",
  };

  return (
    <div style={{ maxWidth: "min(960px, calc(100% - 40px))", margin: "0 auto", padding: "36px 0 100px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ ...shimmer, height: "180px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
          <div style={{ ...shimmer, height: "72px" }} />
          <div style={{ ...shimmer, height: "72px" }} />
          <div style={{ ...shimmer, height: "72px" }} />
        </div>
        <div style={{ ...shimmer, height: "180px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div style={{ ...shimmer, height: "220px" }} />
          <div style={{ ...shimmer, height: "220px" }} />
        </div>
      </div>
    </div>
  );
}

/* suppress unused import warnings — these are still used in error/loading states */
void buildDashboardSeasonMarkers;
void formatDashboardDateTime;
void getDashboardPredictionBadge;
void getDashboardRaceBadge;
