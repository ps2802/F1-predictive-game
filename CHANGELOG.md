# Changelog

All notable changes to Gridlock will be documented in this file.

## [0.1.2.0] - 2026-04-13

### Changed
- Dashboard text contrast improved across all panels — label opacity lifted from 0.32–0.38 to 0.45–0.55 so metadata is actually readable in dim environments
- Font sizes bumped throughout: section labels 9px → 10px, body/subline text 11px → 12–13px, PodiumRow scores 18px → 20px
- Hero card gets a thick red left border stripe (marshal flag) and horizontal telemetry grid lines in the right panel — makes the next-race section feel like an F1 timing screen
- Qualifying lock line now shows an amber **QUALI** label before the timestamp
- Action strip tiles each get a colored left accent border: teal for Wallet, red for Create League, white for Standings — plus an eyebrow category label so the purpose of each tile is immediately clear
- Section headers (My Leagues, Standings, Race Calendar) get left accent borders in teal, gold, and white respectively
- Active/next race rows in the calendar get a red left border and a subtle red background tint to stand out from upcoming races
- Season progress percentage label now reads "2026 Season · X% Complete" for clarity

## [0.1.1.0] - 2026-04-11

### Added
- Per-league competitive context in the dashboard: the My Leagues panel now shows your rank, how many points separate you from P1, and your lead over P2 — so you always know where you stand without clicking in
- On Deck race panel now shows 1 hero race + up to 3 upcoming races (4 total), giving more at-a-glance visibility into the near-term schedule

### Fixed
- P1 user tied with P2 was shown as "Sole leader" — it now correctly shows "Tied"
- League rank context falls back to nulls gracefully when the member list is unavailable, instead of crashing

### For contributors
- `computeLeagueRankContext` added to `lib/dashboard.ts` — pure function, tie-breaks by userId lexicographic order, 100% unit test coverage
- `globalRankDelta` field added to the ViewModel (always null until pg_cron rank snapshot infrastructure is added post-launch)
- Dashboard API no longer populates wallet balance server-side — client hydrates from Privy after mount to avoid stale values
- Broadcast Telemetry design system documented in `DESIGN.md` with full color tokens, typography, spacing, motion, and accessibility specs
- `CLAUDE.md` updated with gstack skill routing rules and DESIGN.md reference

## [0.1.0.0] - 2026-03-31

### Added
- League membership system with invite codes, capacity limits, and entry fees
- Post-race UI showing results, score breakdowns, and verification from predict page
- Email notifications when race results are settled and payouts are ready
- Wallet transaction history showing deposits, payouts, refunds, and fees
- Settlement score calculations with difficulty bonuses for close races
- League settlement system with automatic prize pool distribution
- Support for races with and without qualifying sessions
- Fallback race data and timing for Jolpica API unavailability
- Jolpica API integration for F1 calendar and race data
- Leaderboard with user rankings and points tracking
- Profile history tracking user stats and transaction records
- Administrative settlement endpoint with atomic score and payout processing

### Fixed
- Critical race condition in league member insertion (TOCTOU vulnerability)
- Null check failures in prize pool updates during league settlement
- Silent refund failures now logged for debugging
- Settlement deadline detection for races without qualifying sessions
- Late joiner identification ensuring proper payout eligibility

### Security
- Added Row-Level Security (RLS) policies for all tables
- Validated all API inputs before database operations
- Protected sensitive endpoints with authentication checks
- Implemented atomic transactions for financial operations

## Notes

This is the initial release of Gridlock with core prediction and league features fully implemented. The system is production-ready with comprehensive scoring, settlement, and payout logic.
