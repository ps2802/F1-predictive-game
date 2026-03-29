# Gridlock — F1 Prediction Platform

Next.js 16 + Supabase app. Users sign in with Privy, submit one prediction sheet per race, compete for free on the global leaderboard, and optionally join race-scoped USDC leagues where each member chooses their own stake. The current money flow is custodial and off-chain: supported deposits are normalized into an internal USDC ledger, Gridlock keeps a 10% fee, and payouts are credited back into the same ledger after settlement.

---

## Local Dev Runbook

### 1. Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- `npm install`

### 2. Environment

```bash
cp .env.example .env.local
# Required for local + Vercel:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_ROLE_KEY
# - NEXT_PUBLIC_PRIVY_APP_ID
# - PRIVY_APP_SECRET
# Optional:
# - CRON_SECRET
# - NEXT_PUBLIC_POSTHOG_KEY
# - NEXT_PUBLIC_POSTHOG_HOST
```

### 3. Apply migrations (in exact file order)

Run each file in the Supabase SQL editor, or via `supabase db push` if using the CLI:

```
supabase/migrations/202603100001_init.sql
supabase/migrations/202603100002_seed_races.sql
supabase/migrations/202603110001_full_schema.sql
supabase/migrations/202603110002_create_leaderboard_view.sql
supabase/migrations/202603110003_results_ingestion_and_scoring.sql
supabase/migrations/202603120001_align_predictions_mvp.sql
supabase/migrations/202603180001_create_waitlist.sql
supabase/migrations/202603190001_prd_full_schema.sql   ← new PRD schema
supabase/migrations/202603190002_hardening.sql          ← critical fixes
supabase/migrations/202603190003_add_qualifying_starts_at.sql
supabase/migrations/202603220001_privy_beta.sql
supabase/migrations/202603250001_atomic_ops_and_settlement_jobs.sql
supabase/migrations/202603250001_draft_active_flow.sql
supabase/migrations/202603250001_freeze_popularity_and_fixes.sql
supabase/migrations/202603250002_supabase_rate_limits.sql
supabase/migrations/202603250003_race_status.sql
supabase/migrations/202603260001_fix_drivers_seed_all_races.sql
supabase/migrations/202603260001_profile_auto_create.sql
supabase/migrations/202603260002_security_and_prediction_integrity.sql
supabase/migrations/202603260003_sync_official_2026_race_calendar.sql
supabase/migrations/202603260004_sync_official_2026_driver_team_roster.sql
supabase/migrations/202603260005_prediction_versions_insert_policy.sql
supabase/migrations/202603270001_prize_distribution_functions.sql
supabase/migrations/202603270002_prizing_logic_hardening.sql
supabase/migrations/202603270003_multi_asset_deposit_flow.sql
supabase/migrations/202603270004_atomic_league_stakes_and_prediction_edits.sql
supabase/migrations/202603270005_race_scoped_leagues.sql
supabase/migrations/202603270006_platform_refund_offsets.sql
supabase/migrations/202603270007_withdrawal_availability_holds.sql
```

Do not skip files that share the same timestamp prefix. Preview and staging environments will drift behind the current app code if any file above is omitted.

### 4. Seed race questions

The PRD migration auto-seeds 9 standard questions per race when it runs. If you need to re-seed manually, call the SQL function directly:

```sql
SELECT public.seed_race_questions('japan-2026');
```

### 5. Set yourself as admin

```sql
UPDATE public.profiles SET is_admin = true WHERE id = '<your-user-uuid>';
```

Find your UUID in Supabase → Authentication → Users.

### 6. Run dev server

```bash
npm run dev
```

### 7. Run tests

```bash
npm test           # run once
npm run test:watch # watch mode
```

---

## MVP Launch Checklist

### Infrastructure
- [ ] Supabase project created and connected
- [ ] All migrations applied in order (verify with `SELECT * FROM prediction_questions LIMIT 1`)
- [ ] `is_admin = true` set for at least one user
- [ ] `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_SECRET` set in Vercel env vars
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Vercel env vars
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set in Vercel env vars
- [ ] Domain configured (if custom)

### Verification
- [ ] Sign up with Google/Privy → onboarding flow → username saved
- [ ] Navigate to any upcoming race → prediction form loads qualifying, race, and chaos sections
- [ ] Save race picks → success screen offers leagues, create league, and global leaderboard actions
- [ ] Qualifying locks 10 minutes before qualifying start and GP locks 10 minutes before race start
- [ ] Existing submitted picks can be edited during the 10-minute live edit window and charge the fixed edit fee
- [ ] Global leaderboard scores the same per-race prediction after admin settlement
- [ ] Create a race-scoped league → invite code generated → share link works at `/join/[code]`
- [ ] Join league with a custom stake amount ≥ 5 USDC
- [ ] Admin: submit results → settlement triggered → underfilled leagues refund, qualified leagues pay out

### Content
- [ ] 2026 race calendar correct (verify `SELECT id, name FROM races ORDER BY round`)
- [ ] Driver list updated (`lib/races.ts → drivers[]`)
- [ ] Season dates verified (Japan R3 next upcoming race as of March 2026)

### Feature flags (hide before launch)
- [ ] Wallet/USDC deposit UI shows "coming soon" ✓ (already shows placeholder)
- [ ] Paid league entry fee disabled or clearly marked beta
- [ ] Withdrawal button disabled ✓ (already disabled)

---

## Schema Summary

| Table | Purpose | Key Columns | Used By |
|-------|---------|-------------|---------|
| `profiles` | Extended user data | `username`, `balance_usdc`, `is_admin` | All pages |
| `races` | 2026 F1 calendar | `id`, `round`, `race_starts_at`, `race_locked` | Dashboard, predict form |
| `prediction_questions` | Per-race prediction prompts | `race_id`, `category`, `base_points`, `multi_select` | Predict form, admin |
| `prediction_options` | Selectable answers per question | `question_id`, `option_value` | Predict form, admin |
| `predictions` | User prediction row (one per user per race, shared by global + leagues) | `user_id`, `race_id`, `status`, `edit_count` | v2 API, settle |
| `prediction_answers` | Actual picks (answer to each question) | `prediction_id`, `question_id`, `option_id` | v2 API, settle |
| `prediction_versions` | Audit trail of edits | `prediction_id`, `version_number`, `answers_json` | v2 API |
| `race_results` | Correct answers after race | `race_id`, `question_id`, `correct_option_id` | Admin results API |
| `race_scores` | Computed score per user per race | `user_id`, `race_id`, `total_score`, `breakdown_json` | Leaderboard, profile |
| `leagues` | Race-scoped league contests | `race_id`, `name`, `invite_code`, `entry_fee_usdc`, `prize_pool` | Leagues pages, settle |
| `league_members` | League membership + chosen stake | `league_id`, `user_id`, `paid`, `stake_amount_usdc` | League join, settle |
| `league_scores` | Per-league score per user for that league race | `league_id`, `user_id`, `race_id`, `score` | League leaderboard |
| `transactions` | Internal USDC balance ledger | `user_id`, `type`, `amount` | Wallet, league join |
| `deposit_events` | On-chain deposit records + USDC credit normalization | `tx_hash`, `wallet_address`, `amount`, `token`, `swapped_amount_usdc`, `credited_amount_usdc`, `fee_amount_usdc` | Admin wallet credit |
| `fee_wallet` | Platform fee ledger in USDC | `amount`, `league_id`, `description` | League rake, deposit/swap fees, edit fees |
| `edit_events` | Paid live edit audit trail | `prediction_id`, `edit_number`, `cost_usdc` | Prediction edit flow |
| `payout_holds` | Reserved held payouts pending manual review | `settlement_id`, `user_id`, `amount`, `released` | Settlement |
| `withdrawal_holds` | 24-hour withdrawal availability holds for credited payouts | `settlement_id`, `user_id`, `amount`, `available_at`, `released` | Future withdrawal flow |
| `pick_popularity_snapshots` | Frozen pick counts at lock | `question_id`, `option_id`, `popularity_percent` | Settlement |

### Views
| View | Purpose |
|------|---------|
| `leaderboard` | Global rank by `race_scores.total_score` |
| `league_leaderboard` | Per-league rank for that league's target race |

---

## Known Gaps (not in MVP scope)

### Not implemented
- **Live wallet rails** — deposits can only be credited manually via admin API (`POST /api/wallet/deposit`). There is no automatic Privy wallet onramp, deposit watcher, swap executor, withdrawal signer, or offramp.
- **Non-custodial escrow** — this repo does not use on-chain escrow or smart contracts for league pools. All balances and payouts are internal ledger movements in USDC.
- **Popularity snapshot freeze** — no cron job freezes pick percentages at lock time. Settlement still falls back to computing popularity from active predictions.
- **Automated race locking** — race and qualifying times exist, but full operational automation around every lock state still needs production scheduling and monitoring.
- **Withdrawal execution** — normal payouts are credited immediately and tagged with a 24-hour withdrawal hold, but there is still no actual withdrawal endpoint or release worker.
- **Held payout release flow** — suspicious-account payout holds are reserved, but there is no admin release/disbursement UI yet.
- **Email / push notifications** — no race reminder or payout notification delivery exists yet.

### Technical debt
- `lib/races.ts` is the source of truth for race IDs/names on the frontend but `races` table is the source of truth in the DB. They must be kept in sync manually.
- The old `/api/predictions` route (podium-only, v1) is still live. It writes `first_driver/second_driver/third_driver` which are now nullable. It should be deprecated once the new form rolls out.
- `profiles.points` column from original schema is unused (replaced by `race_scores` table).
- League creation/join and settlement are transactional in SQL, but there is still no external reconciliation layer against a real custodian or chain indexer.

### Deferred to post-launch
- Analytics (PostHog)
- Email verification flow UI
- Public league discovery / search
- Admin: view all predictions per race
- Season archive / historical leaderboards
