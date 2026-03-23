# Gridlock

F1 prediction game for the 2026 season. Users make per-race predictions across qualifying, race, and chaos question categories, then compete on a global leaderboard. Anti-herd scoring rewards unpopular correct picks. Currently in closed beta at [joingridlock.com](https://joingridlock.com) — no real money, simulated balances only.

---

## What it is

- Predict outcomes across 24 F1 rounds (2026 season)
- Three question categories per race: Qualifying, Race, Chaos
- ~9 questions per race (podium, race winner, fastest lap, points finishers, etc.)
- Anti-herd scoring: rarer correct picks score higher via a log2 difficulty multiplier
- Compete on a global leaderboard and in invite-code leagues
- **Closed beta**: all users start with 100 simulated Beta Credits (₮). No real money, no withdrawals.

Core user loop: Sign up → set username → pick a race → answer questions → submit → check leaderboard after results are entered.

---

## Current status

### Working
- Privy-based auth (email, Google, Apple — whatever is enabled in Privy dashboard)
- Supabase session bridge (Privy JWT → Supabase session via `/api/auth/privy-sync`)
- Onboarding flow (username setup after first login)
- Dashboard: 2026 race calendar with open/locked states
- Prediction form: 3-step multi-question flow (Qualifying / Race / Chaos)
- Anonymous pick drafting (saved to localStorage, synced to DB on login)
- Prediction submission and edit (v2 API)
- Race locking (manual via admin, or automatic when `qualifying_starts_at` is passed)
- Admin panel: race management, result entry, settlement trigger
- Scoring engine: anti-herd formula, per-question types, edit penalty, chaos bonus
- Score settlement: triggered by admin when results are entered
- Global leaderboard (`/leaderboard`)
- Leagues: create, join by invite code, per-league leaderboard
- Profile page
- Wallet page (displays simulated Beta Credits; no deposit/withdrawal UI)

### Partially complete
- Leagues: create/join/view works; paid entry fee logic exists in the API but is not wired to real USDC
- Popularity snapshot: settlement computes pick popularity live from `prediction_answers` (correct, but gameable in theory after lock — no freeze cron)
- Edit penalty: computed in scoring; the paid-edit deduction flow (charging `balance_usdc` per edit) is not wired up; edits are currently free but do reduce score

### Not live yet
- Real USDC deposits or withdrawals — wallet shows simulated balance only
- Automated race locking — admin must manually lock or submit results
- On-chain deposit watcher (Helius) — USDC credits can only be set manually
- Payout distribution — `payout_model` column exists, no payout logic
- Email notifications (race reminders, results)
- Public league discovery/search
- Analytics

---

## Core features

| Feature | Status |
|---|---|
| Privy auth (email/social) | ✅ Live |
| Supabase session bridge | ✅ Live |
| Onboarding / username setup | ✅ Live |
| Race dashboard | ✅ Live |
| Multi-question prediction form | ✅ Live |
| Race locking (manual + deadline) | ✅ Live |
| Admin result entry + settlement | ✅ Live |
| Anti-herd scoring engine | ✅ Live |
| Global leaderboard | ✅ Live |
| Leagues (create/join/view) | ✅ Live |
| Profile + race history | ✅ Live |
| Simulated beta wallet | ✅ Live (display only) |
| Real USDC / payouts | ❌ Not implemented |
| Automated race lock scheduler | ❌ Not implemented |
| Email notifications | ❌ Not implemented |

---

## Auth flow

Auth entry point is **Privy** only. There is no Supabase login form.

1. User clicks "Sign in" → opens Privy modal
2. Privy authenticates via email/Google/Apple (methods configured in Privy dashboard)
3. On success, the client posts the Privy access token to `POST /api/auth/privy-sync`
4. `privy-sync` server route:
   - Verifies the Privy JWT using `PRIVY_APP_SECRET`
   - Fetches the Privy user to get email and embedded Solana wallet address
   - Finds or creates a Supabase auth user (matched by email, auto-confirmed)
   - Upserts `profiles` row: sets `privy_user_id`, `wallet_address`, `is_beta_account = true`
   - Generates a Supabase magic-link OTP and returns `{ token, email }` to the client
5. Client calls `supabase.auth.verifyOtp({ email, token, type: 'email' })` to establish a Supabase session
6. From this point all API routes use `supabase.auth.getUser()` as normal
7. New users (no username) are redirected to `/onboarding`; returning users go to `/dashboard`

New user profile creation (100 Beta Credits) is handled by a Supabase `handle_new_user` trigger on `auth.users`.

Required env vars for auth: `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (PostCSS) |
| Font | Titillium Web (Google Fonts) |
| Auth | Privy (`@privy-io/react-auth` + `@privy-io/server-auth`) |
| Database / backend | Supabase (PostgreSQL + Auth + RLS) |
| Hosting | Vercel |
| Tests | Vitest |

---

## Project structure

```
app/
  page.tsx                   — Landing page (redirects to /dashboard)
  layout.tsx                 — Root layout, metadata, fonts
  providers.tsx              — PrivyProvider wrapper
  login/page.tsx             — Login page (triggers Privy modal)
  signup/page.tsx            — Signup page (same Privy flow)
  onboarding/page.tsx        — Username setup (new users only)
  dashboard/page.tsx         — Race calendar (authenticated)
  predict/[raceId]/page.tsx  — Multi-question prediction form
  leaderboard/page.tsx       — Global leaderboard
  leagues/                   — League list, create, view
  profile/page.tsx           — User profile + race history
  wallet/page.tsx            — Beta balance display
  admin/page.tsx             — Race management + result entry (is_admin only)
  scores/[raceId]/page.tsx   — Per-race score breakdown
  api/
    auth/privy-sync/         — Privy→Supabase session bridge (POST)
    predictions/             — v1 prediction route (legacy, podium-only)
    predictions/v2/          — v2 prediction route (multi-question, active)
    admin/results/           — Enter race results (admin only)
    admin/settle/            — Trigger score settlement (admin only)
    admin/races/             — Race CRUD (admin only)
    leagues/                 — League list + create
    leagues/join/            — Join league by invite code
    profile/                 — Get/update profile
    scores/[raceId]/         — Per-race score data
    wallet/deposit/          — Manual credit (admin only, no real USDC)
    waitlist/                — Email waitlist signup (POST)
lib/
  races.ts                   — 2026 F1 calendar (static, 24 rounds) + driver list
  scoring/settleRace.ts      — Scoring engine (deterministic, fully tested)
  supabase/
    client.ts                — Browser Supabase client
    server.ts                — Server Supabase client (SSR)
    admin.ts                 — Service-role client (server only)
supabase/migrations/         — 11 SQL migrations (apply in order)
tests/                       — Vitest unit tests for scoring engine
scripts/
  seed-races.ts              — Populate races table from Jolpica API
```

---

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- A Privy app (free tier works — create at privy.io)

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

There is no `.env.example` in the repo. Create `.env.local` with:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Privy
NEXT_PUBLIC_PRIVY_APP_ID=<privy app id>
PRIVY_APP_SECRET=<privy app secret>
```

Never commit `.env.local`. It is in `.gitignore`.

### 3. Apply database migrations

Run each file in order via the Supabase SQL editor or `supabase db push`:

```
supabase/migrations/202603100001_init.sql
supabase/migrations/202603100002_seed_races.sql
supabase/migrations/202603110001_full_schema.sql
supabase/migrations/202603110002_create_leaderboard_view.sql
supabase/migrations/202603110003_results_ingestion_and_scoring.sql
supabase/migrations/202603120001_align_predictions_mvp.sql
supabase/migrations/202603180001_create_waitlist.sql
supabase/migrations/202603190001_prd_full_schema.sql
supabase/migrations/202603190002_hardening.sql
supabase/migrations/202603190003_add_qualifying_starts_at.sql
supabase/migrations/202603220001_privy_beta.sql
```

The PRD migration (`202603190001`) auto-seeds 9 standard questions per race. To re-seed a specific race manually:

```sql
SELECT public.seed_race_questions('japan-2026');
```

### 4. Set yourself as admin

```sql
UPDATE public.profiles SET is_admin = true WHERE id = '<your-user-uuid>';
```

Find your UUID in Supabase → Authentication → Users.

### 5. Run dev server

```bash
npm run dev
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key — server only, never expose to browser |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Privy app ID — used in browser PrivyProvider |
| `PRIVY_APP_SECRET` | Yes | Privy app secret — server only (`privy-sync` route) |

---

## Database and backend notes

- 11 migrations define the full schema. Apply them in filename order.
- The `handle_new_user` trigger on `auth.users` auto-creates a `profiles` row with 100 Beta Credits on first signup.
- Race locking: two signals — `race_locked` boolean (admin-controlled) OR `qualifying_starts_at` timestamp in the past. Either locks the race. No automated scheduler exists; admin must set `race_locked = true` manually or it locks via the deadline.
- Score settlement runs in `lib/scoring/settleRace.ts` (TypeScript, deterministic). The admin calls `POST /api/admin/settle` which runs settlement for all predictions on a race and writes to `race_scores`.
- RLS is enabled on all tables. The `leaderboard` and `league_leaderboard` are SQL views.
- `profiles.points` (legacy column from early schema) is unused — scores live in `race_scores`.
- The v1 predictions route (`/api/predictions`) writes `first_driver/second_driver/third_driver` (old podium-only format). It is still live but should be treated as dead code — the active form uses v2.
- `lib/races.ts` is the client-side source of truth for race IDs and names. It must stay in sync with the `races` table manually.

---

## Testing

Tests use Vitest. Three test files exist:

```bash
npm test           # run once
npm run test:watch # watch mode
```

| File | Covers |
|---|---|
| `tests/scoring.test.ts` | Full scoring engine: difficulty multiplier, edit penalty, confidence tiers, per-question-type scoring, chaos bonus, score caps |
| `tests/popularity.test.ts` | Pick popularity calculation and snapshot logic |
| `tests/settlement-edge-cases.test.ts` | Settlement with missing answers, tied scores, multi-select questions |

No E2E tests exist. No UI component tests exist.

---

## Known limitations / beta notes

- **No real money.** All balances are simulated Beta Credits (₮). The wallet page is display-only. No deposits, no withdrawals, no payouts.
- **Race locking is manual.** No cron job sets `race_locked = true` at race time. Admin must lock races manually or rely on the `qualifying_starts_at` deadline.
- **Paid leagues are not functional.** The `entry_fee_usdc` column and join-fee logic exist in the API, but there is no real USDC integration. All leagues are effectively free.
- **No payout logic.** `payout_model` and `payout_config` columns exist in the schema. No distribution code exists.
- **No on-chain detection.** Wallet credits can only be adjusted via the admin API (`POST /api/wallet/deposit`). Helius (USDC deposit watcher) is not integrated.
- **Popularity snapshot not frozen.** Settlement computes pick popularity live from `prediction_answers` at settlement time. There is no cron to snapshot popularity at lock. This is accurate but theoretically gameable.
- **Edit credits not charged.** The edit penalty is applied to scores but `balance_usdc` is not deducted per edit. Edits are free in the current beta.
- **No email notifications.** No race reminders, results emails, or any transactional email.
- **Privy login methods depend on dashboard config.** Auth methods (email, Google, Apple) are controlled in the Privy dashboard, not in code. If a method is not enabled there, it will not appear in the modal.

---

## Deployment

- Hosted on **Vercel** (Next.js App Router, edge-compatible)
- All five env vars above must be set in Vercel project settings
- Database is Supabase (all migrations must be applied before first deploy)
- No build-time database access — all data fetching is runtime

---

## Contributor notes

- The critical auth path is: `app/login/page.tsx` → `handlePrivyLoginComplete` → `POST /api/auth/privy-sync` → Supabase `verifyOtp`. Do not break this chain.
- The scoring engine (`lib/scoring/settleRace.ts`) is the most tested part of the codebase. Do not change scoring logic without updating tests.
- The prediction form (`app/predict/[raceId]/page.tsx`) uses localStorage for anonymous draft persistence — this is intentional. Server-side answers are loaded on top when the user is authenticated.
- Do not introduce unrelated refactors during beta hardening. Prefer minimal targeted patches.
- `lib/races.ts` and the `races` DB table must be kept in sync manually — there is no automated sync.
- The v1 predictions API route should not be extended; all new work goes through v2.
