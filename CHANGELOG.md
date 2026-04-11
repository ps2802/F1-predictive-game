# Changelog

All notable changes to Gridlock will be documented in this file.

## [0.1.1.0] - 2026-04-11

### Added
- Per-league competitive context in the dashboard: users now see their rank, points gap to P1, and points lead over P2 directly in the My Leagues panel
- `leagueSubline` shows "P1 · Leading by N pts", "P1 · Tied", "P2 · N pts behind P1", or member count as fallback
- `computeLeagueRankContext` utility for per-league rank and gap calculation, fully tested

### Changed
- On Deck race panel now shows 1 hero race + up to 3 upcoming (4 total) instead of 3
- `globalRankDelta` field added to the ViewModel but always returns null (UI hides it); pg_cron rank snapshot infrastructure deferred post-launch
- Dashboard API no longer exposes wallet balance server-side — client hydrates from Privy after mount
- Broadcast Telemetry design system documented in `DESIGN.md` with full color tokens, typography, spacing, motion, and accessibility specs
- `CLAUDE.md` updated with gstack skill routing rules and DESIGN.md reference

### Fixed
- Race fallback tests updated to use the correct `usa-2026` race ID (Miami GP round 4)
- P1 user tied with P2 was incorrectly displayed as "Sole leader" — now correctly shows "Tied"
- Missing error handling for `league_members` fetch — gracefully degrades rank context to nulls on failure

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
