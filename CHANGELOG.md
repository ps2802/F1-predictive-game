# Changelog

All notable changes to Gridlock will be documented in this file.

## [0.1.2.0] - 2026-04-14

### Changed
- Wallet page fully redesigned as a financial dashboard — hero balance card with large typography and teal glow accent, deposit address panel with live status pill (ready/no-wallet), color-coded ledger rows (teal for income, amber for pending), two-column layout for Ledger and Deposits
- Financial numbers now use `font-variant-numeric: tabular-nums` to prevent digit jitter on balance updates
- Wallet page title changed to semantic `<h1>` for accessibility
- Status pill conditionally shows amber "No wallet linked" when no Solana wallet is assigned, replacing the always-teal "Ready to receive"

### Fixed
- Next.js Turbopack startup crash caused by `[inviteCode]` and `[leagueId]` dynamic route segments at the same path level — merged into a single `[leagueId]` handler

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
