# F1 Predictive Game

Next.js App Router project with Supabase auth and race prediction workflow.

## Required folders

- `app/login`
- `app/signup`
- `app/dashboard`
- `app/predict/[raceId]`
- `lib/supabase`
- `supabase/migrations`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Add environment variables:

```bash
cp .env.example .env.local
```

Update `.env.local` with your Supabase values.

3. Run app:

```bash
npm run dev
```

## Supabase schema

Apply SQL files in `supabase/migrations` in order:

- `202603100001_init.sql`
- `202603100002_seed_races.sql`
