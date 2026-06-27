# Gridlock — Free F1 Prediction Game

Next.js 16 + Supabase app. A **free, Web2 friends game**: sign in with Google, predict
the podium (and a few bonus calls) for each 2026 Formula 1 race, and compete on the global
leaderboard and in private friend leagues. No crypto, no money, no stakes — just bragging
rights. Race results are settled from the live [Jolpica](https://api.jolpi.ca/) (Ergast-compatible)
F1 API; safety-car calls that Jolpica does not expose are entered manually by an admin.

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
# - SUPABASE_SERVICE_ROLE_KEY      # server-only: seed script + cron/admin routes
# Optional:
# - CRON_SECRET                    # protects /api/cron/* endpoints
# - NEXT_PUBLIC_POSTHOG_KEY
# - NEXT_PUBLIC_POSTHOG_HOST
# - POSTHOG_API_KEY
# - NEXT_PUBLIC_CLARITY_PROJECT_ID
# - NEXT_PUBLIC_ANALYTICS_ENABLED=true   # production only
```

Authentication is **Supabase Auth with Google OAuth**. Enable the Google provider in your
Supabase project (Authentication → Providers → Google) and add your local and production
redirect URLs.

### 3. Apply migrations

Run the files in `supabase/migrations/` in filename order via the Supabase SQL editor, or
with `supabase db push` if using the CLI. Files that share a timestamp prefix must all be
applied — preview and staging environments drift behind the app code if any is skipped.

The Web2 de-monetization migration (`202606270001_web2_demonetize.sql`) removes the legacy
money/ledger surfaces, adds `races.lock_time_utc`, and provides the money-free
`record_prediction_submission(...)` RPC.

### 4. Seed race questions

The schema migration auto-seeds the standard questions per race when it runs. To re-seed a
single race manually, call the SQL function directly:

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

## Prediction Lock Timing

Predictions for a race lock `PRE_LOCK_BUFFER_MINUTES` (10 minutes) before the first
competitive session of the weekend. The single lock anchor is
`races.lock_time_utc ?? qualifying_starts_at ?? race_starts_at`, and locking happens at
`anchor − 10min` (see `lib/predictionWindows.ts`). There is no paid edit — once a race is
locked, submissions for it are closed.

## Settlement (Jolpica)

Race results are read server-side from the Jolpica F1 API (`lib/jolpica.ts`):

| Signal | Source |
|--------|--------|
| Pole | `qualifying.json` |
| Winner / podium / fastest lap / finishing order | `results.json` |
| DNF band | results `status` / `positionText` |
| Biggest gainer | grid position vs. finishing position |
| Safety car | **not in Jolpica** — manual admin entry only |

## Scheduled Jobs (Vercel cron — see `vercel.json`)

| Path | Schedule (UTC) | Purpose |
|------|----------------|---------|
| `/api/cron/lock-races` | `0 11 * * *` | Lock races whose window has closed |
| `/api/cron/advance-race-state` | `0 13 * * *` | Advance race lifecycle state |
| `/api/cron/settle-races` | `0 16 * * *` | Settle finished races from Jolpica |

---

## Schema Summary

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | Extended user data | `username`, `points`, `is_admin` |
| `races` | 2026 F1 calendar | `id`, `round`, `race_starts_at`, `lock_time_utc`, `is_locked` |
| `prediction_questions` | Per-race prediction prompts | `race_id`, `category`, `base_points`, `multi_select` |
| `prediction_options` | Selectable answers per question | `question_id`, `option_value` |
| `predictions` | User prediction row (one per user per race) | `user_id`, `race_id`, `status` |
| `prediction_answers` | Actual picks (answer to each question) | `prediction_id`, `question_id`, `option_id` |
| `prediction_versions` | Audit trail of edits | `prediction_id`, `version_number`, `answers_json` |
| `race_results` | Correct answers after race | `race_id`, `question_id`, `correct_option_id` |
| `race_scores` | Computed score per user per race | `user_id`, `race_id`, `total_score`, `breakdown_json` |
| `leagues` | Private friend leagues (free) | `name`, `invite_code` |
| `league_members` | League membership | `league_id`, `user_id` |
| `league_scores` | Per-league score per user | `league_id`, `user_id`, `race_id`, `score` |

### Views
| View | Purpose |
|------|---------|
| `leaderboard` | Global rank by `race_scores.total_score` |
| `league_leaderboard` | Per-league rank |

---

## Scoring

Each question awards points from `base_points`. For the podium: an exact position match
scores full points, and a driver who lands on the podium in the wrong position scores
partial points. Scoring runs automatically when an admin submits results and settlement
fires.

---

## Notes

- `lib/races.ts` is the frontend source of truth for race IDs/names; the `races` table is
  the DB source of truth. Keep them in sync manually.
- Leagues and predictions are entirely free. There is no wallet, deposit, withdrawal,
  entry fee, prize pool, or payout anywhere in the app.
