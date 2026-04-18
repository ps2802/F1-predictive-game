# Changelog

All notable changes to Gridlock will be documented in this file.

## [0.1.3.0] - 2026-04-19

### Changed
- Nav header rebuilt as a clean 3-column layout: logo left, primary nav centered, account utility right — eliminates the duplicate raw text block and unstyled hamburger that were rendering on all screen sizes
- Sign out is now a low-emphasis utility action (barely visible, no button styling) instead of a primary nav link
- Wallet balance now shows in teal, matching the design token for positive/financial values
- Active nav link gets a 2px red bottom indicator instead of just color change
- Mobile nav now has proper CSS — hamburger renders as 3 lines, mobile drawer slides down with styled touch-target rows
- Wallet page split into a server entry component + `WalletPageClient` for cleaner SSR/hydration boundary

## [0.1.2.0] - 2026-04-16

### Changed
- Dashboard text contrast increased across the board: eyebrow labels, detail lines, section actions, and standings subtext are all more readable
- Nav bar alignment fixed: no longer floats 3px from the viewport top; height bumped to 64px for cleaner vertical rhythm; nav links more legible at rest and hover
- My Leagues rows have more breathing room (16px padding) and a more visible View button
- Action strip arrows and sub-labels now carry enough contrast to read at a glance
- Wallet balance label and Deposit USDC tile include tooltips explaining what they do
- Standings + Race Calendar panel now collapses to a single column on mobile — was stuck in two columns due to inline style with no responsive override
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
