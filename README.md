# Gridlock — F1 Predictive Game

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Supabase

Users predict the podium (1st/2nd/3rd) for each 2026 F1 race and compete on a global leaderboard.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment file

```bash
cp .env.example .env.local
```

Then fill in `.env.local`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → service_role key (keep secret) |

### 3. Apply database migrations

Run all files in `supabase/migrations/` in filename order via the Supabase dashboard
(SQL Editor) or the Supabase CLI:

```bash
supabase db push
```

Migrations in order:
1. `202603100001_init.sql`
2. `202603100002_seed_races.sql`
3. `202603110001_full_schema.sql`
4. `202603110002_create_leaderboard_view.sql`
5. `202603110003_results_ingestion_and_scoring.sql`
6. `202603120001_align_predictions_mvp.sql`
7. `202603180001_create_waitlist.sql`
8. `202603220001_seed_full_calendar.sql` ← seeds all 23 races
9. `202603220002_results_corrected_at.sql`

Migration `202603220001_seed_full_calendar.sql` seeds the full 2026 calendar.
After running it, `npm run seed:races` is only needed if you want to refresh
race data from the Jolpica API directly.

### 4. Run dev server

```bash
npm run dev
```

App is at `http://localhost:3000`.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Start production server (requires build) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type-checker (`tsc --noEmit`) |
| `npm run seed:races` | Fetch 2026 calendar from Jolpica API and upsert into Supabase |

CI runs `lint` + `typecheck` + `build` on every push/PR via `.github/workflows/ci.yml`.

---

## Seeding race data

The migration `202603220001_seed_full_calendar.sql` is the recommended way to seed
all 23 races. It is idempotent (`ON CONFLICT DO NOTHING`) and safe to re-run.

`npm run seed:races` fetches live data from the Jolpica API and upserts into Supabase.
It requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

---

## Tests / E2E

**There are no automated tests in this project yet.**

No test framework (Jest, Playwright, Cypress) is installed. Linting and
type-checking (`npm run lint`, `npm run typecheck`) are the current quality gates.

CI runs lint + typecheck + build on every push to `main`.

---

## Troubleshooting

**`Error: Missing NEXT_PUBLIC_SUPABASE_URL`**
`.env.local` is missing or the variable name has a typo. Copy `.env.example`
and fill in the values from your Supabase project settings.

**`Error: Missing SUPABASE_SERVICE_ROLE_KEY`**
This is only needed for `npm run seed:races`. Add it to `.env.local`.
Never expose this key to the browser.

**Predictions API returns 404 for every race**
The `races` table is empty. Run migrations through step 8
(`202603220001_seed_full_calendar.sql`) to populate it.

**Predictions API returns 403 "Predictions locked"**
Either `races.is_locked = true` for that race, or today's date is past `race_date`.
Check the `races` row in Supabase.

**Supabase auth not working / redirect loop**
Confirm `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
and that email confirmation is configured in your Supabase Auth settings.

**`npm run seed:races` inserts nothing / errors on column names**
The seed script targets the Jolpica API schema. If your DB schema has diverged,
use the migration file directly instead. The seed script is a convenience tool,
not required for normal setup.

**Build fails in CI with missing env vars**
Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository
secrets in GitHub (Settings → Secrets → Actions). The CI workflow reads them
from `secrets.*`.
