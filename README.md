# Gridlock — F1 Prediction Platform

Next.js 16 + Supabase app. Predict podiums, qualify picks, and chaos outcomes. Anti-herd scoring rewards unpopular correct picks. League system with USDC prize pools.

---

## Local Dev Runbook

### 1. Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- `npm install`

### 2. Environment

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# Fill in SUPABASE_SERVICE_ROLE_KEY (for admin operations + seeding)
```

### 3. Apply migrations (in order)

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
```

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
- [ ] All 9 migrations applied in order (verify with `SELECT * FROM prediction_questions LIMIT 1`)
- [ ] `is_admin = true` set for at least one user
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Vercel env vars
- [ ] Domain configured (if custom)

### Verification
- [ ] Sign up → onboarding flow → username saved
- [ ] Navigate to any upcoming race → prediction form loads questions
- [ ] Submit predictions → success screen shown
- [ ] Admin: `/admin` accessible, race selectable, questions load
- [ ] Admin: submit results → settlement triggered → scores appear at `/leaderboard`
- [ ] Create league → invite code generated → share link works at `/join/[code]`
- [ ] Join league → member appears in league leaderboard
- [ ] Global leaderboard at `/leaderboard` loads and shows scores

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
| `predictions` | User prediction row (one per user per race) | `user_id`, `race_id`, `status`, `edit_count` | v2 API, settle |
| `prediction_answers` | Actual picks (answer to each question) | `prediction_id`, `question_id`, `option_id` | v2 API, settle |
| `prediction_versions` | Audit trail of edits | `prediction_id`, `version_number`, `answers_json` | v2 API |
| `race_results` | Correct answers after race | `race_id`, `question_id`, `correct_option_id` | Admin results API |
| `race_scores` | Computed score per user per race | `user_id`, `race_id`, `total_score`, `breakdown_json` | Leaderboard, profile |
| `leagues` | League definitions | `name`, `invite_code`, `entry_fee_usdc`, `prize_pool` | Leagues pages |
| `league_members` | League membership | `league_id`, `user_id`, `paid` | League join, leaderboard |
| `league_scores` | Per-league score per user per race | `league_id`, `user_id`, `race_id`, `score` | League leaderboard |
| `transactions` | USDC balance ledger | `user_id`, `type`, `amount` | Wallet, league join |
| `deposit_events` | On-chain deposit records | `tx_hash`, `wallet_address`, `amount` | Admin wallet credit |
| `edit_events` | Paid edit audit trail | `prediction_id`, `edit_number`, `cost_usdc` | Future edit flow |
| `pick_popularity_snapshots` | Frozen pick counts at lock | `question_id`, `option_id`, `popularity_percent` | Settlement |

### Views
| View | Purpose |
|------|---------|
| `leaderboard` | Global rank by `race_scores.total_score` |
| `league_leaderboard` | Per-league rank (filter by `league_id`) |

---

## Known Gaps (not in MVP scope)

### Not implemented
- **Moongate SDK** — Google login + embedded Solana wallet provisioning. `wallet_address` column exists but is never populated. Wallet page shows placeholder.
- **Helius deposit watcher** — USDC deposits can only be credited manually via admin API (`POST /api/wallet/deposit`). No automatic on-chain detection.
- **Edit credits** — `edit_events` table exists. Edit penalty is computed in scoring. But the paid-edit flow (charge user per edit) is not wired up. Currently edits are free and just reduce score via the penalty formula.
- **Popularity snapshot freeze** — No cron job exists to freeze pick percentages at lock time. Settlement falls back to computing popularity on-the-fly from `prediction_answers`, which is correct but theoretically gameable after lock.
- **Race lock scheduler** — No automated job sets `race_locked = true` at `race_starts_at`. Admin must manually set it (or submit results which auto-locks).
- **Quali lock** — `quali_locked` column exists. No logic uses it yet.
- **Paid leagues** — `entry_fee_usdc > 0` logic runs in the join API but without Helius integration there's no real USDC. `increment_prize_pool` RPC added in hardening migration.
- **Payout distribution** — `payout_model` and `payout_config` columns exist. No payout logic implemented.
- **Email notifications** — No race reminder or results notification emails.

### Technical debt
- `lib/races.ts` is the source of truth for race IDs/names on the frontend but `races` table is the source of truth in the DB. They must be kept in sync manually.
- The old `/api/predictions` route (podium-only, v1) is still live. It writes `first_driver/second_driver/third_driver` which are now nullable. It should be deprecated once the new form rolls out.
- `profiles.points` column from original schema is unused (replaced by `race_scores` table).

### Deferred to post-launch
- Analytics (PostHog)
- Email verification flow UI
- Public league discovery / search
- Admin: view all predictions per race
- Season archive / historical leaderboards
