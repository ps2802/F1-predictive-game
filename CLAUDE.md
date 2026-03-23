# Gridlock — Claude Code Project Context

## What This Is

**Gridlock** is an F1 predictive game where users predict podium finishes (1st/2nd/3rd) for each 2026 Formula 1 race and compete on a global leaderboard. Site: joingridlock.com

**Stage:** Waitlist live → launching for 2026 season (23 rounds, 20 drivers)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (via PostCSS) |
| Font | Titillium Web (Google Fonts) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Hosting | Vercel |
| External API | Jolpica (F1 calendar data) |

## Project Structure

```
app/
  page.tsx              — Landing/waitlist (public)
  layout.tsx            — Root layout, metadata, fonts
  dashboard/page.tsx    — Race list (authenticated)
  predict/[raceId]/     — Podium prediction form (authenticated)
  api/
    predictions/route.ts — Save prediction (POST)
    waitlist/route.ts    — Email signup (POST)
lib/
  races.ts              — 2026 F1 calendar + 20-driver list (static)
  supabase/
    client.ts           — Browser Supabase client
    server.ts           — Server Supabase client (SSR)
supabase/migrations/    — PostgreSQL schema, RLS, triggers, views
scripts/
  seed-races.ts         — Populate races from Jolpica API
```

## Database Schema (Key Tables)

- **profiles** — user_id, username, points (auto-created on signup via trigger)
- **races** — id (slug), round, name, country, race_date, is_locked
- **predictions** — user_id, race_id, first_driver, second_driver, third_driver, points_awarded; UNIQUE(user_id, race_id); all 3 drivers must differ
- **results** — race_id (PK), p1, p2, p3, is_final; scoring fires automatically via trigger
- **waitlist** — email (UNIQUE); service_role_only RLS
- **leaderboard** — SQL view; SUM(points) per user, ordered DESC

## Scoring Logic

Exact match on position = 3 pts. Driver appears in podium but wrong position = 1 pt. Scoring is automatic via Supabase trigger when results are inserted.

## Active Drivers (2026)

Max Verstappen, Liam Lawson, Lando Norris, Oscar Piastri, Charles Leclerc, Lewis Hamilton, George Russell, Andrea Kimi Antonelli, Fernando Alonso, Lance Stroll, Esteban Ocon, Oliver Bearman, Yuki Tsunoda, Isack Hadjar, Carlos Sainz, Alexander Albon, Nico Hülkenberg, Gabriel Bortoleto, Pierre Gasly, Jack Doohan

## Environment Variables

```bash
# .env.local (never commit)
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=       # Service role (seed script only)

# Shell env (for MCP servers — never commit)
SUPABASE_ACCESS_TOKEN=           # Supabase personal access token (for MCP)
GITHUB_PERSONAL_ACCESS_TOKEN=    # GitHub PAT (for GitHub MCP, optional)
```

---

## TypeScript Rules

Follow these rules for all TypeScript/JavaScript code in this project.

### Immutability
- Always create new objects; never mutate existing state directly
- Use `const` by default; use `let` only when reassignment is necessary
- Prefer spread operators and `Array.map/filter/reduce` over in-place mutation

### Types
- Use explicit return types on all exported functions
- Prefer `interface` for object shapes, `type` for unions/intersections
- No `any` — use `unknown` and narrow with type guards
- Use Zod or explicit validation at API boundaries (POST routes)

### File Organization
- Max file size: 800 lines; target 200–400 lines
- One component or one logical unit per file
- Name files after what they export (`PredictionForm.tsx`, not `form.tsx`)
- Group by feature, not by type (keep component + its hook + its types together)

### Functions
- Max function length: 50 lines; extract helpers when exceeded
- Max nesting depth: 4 levels
- Pure functions preferred — side effects isolated to hooks/actions/routes
- All async functions must have explicit error handling

### React / Next.js
- Server Components by default; add `'use client'` only when needed (event handlers, browser APIs, hooks)
- Use `cookies()` and `headers()` from `next/headers` in Server Components
- Never use `getServerSideProps` or `getStaticProps` — this is App Router
- Supabase server client from `lib/supabase/server.ts` in RSC and API routes
- Supabase browser client from `lib/supabase/client.ts` in Client Components only

### Error Handling
- API routes must return typed error responses with HTTP status codes
- Never silently swallow errors — log on server, show user-friendly message on client
- Validate all user inputs at API boundaries before touching the database
- Use early returns over nested conditionals

### No-Go Patterns
- No `console.log` in committed code — use structured logging or remove before commit
- No hardcoded Supabase keys, API tokens, or any secrets in source files
- No direct SQL string concatenation — use Supabase query builder or parameterized queries
- No `eslint-disable` comments without a documented reason in the same comment

---

## Security Rules

### Before Every Commit
Verify:
- No hardcoded secrets (API keys, tokens, passwords, URLs with credentials)
- All user inputs validated before database operations
- No SQL string concatenation (use `.eq()`, `.insert()`, `.upsert()` — never raw SQL with user data)
- RLS is enabled and correct for any new Supabase table
- Error messages don't expose internal state (stack traces, SQL errors) to the client

### Secret Management
- All secrets live in `.env.local` (local dev) or Vercel environment variables (production)
- `.env.local` is in `.gitignore` — never commit it
- `SUPABASE_SERVICE_ROLE_KEY` is server-only and only used in the seed script — never expose to browser
- If a secret is accidentally committed: rotate it immediately, then remove from git history

### RLS Policy Requirements
Every new Supabase table must have:
- RLS enabled (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`)
- Explicit policies for each operation (SELECT, INSERT, UPDATE, DELETE)
- Default deny (no policy = no access)

### API Route Security
- Check authentication before any data operation: `const { data: { user } } = await supabase.auth.getUser()`
- Return 401 (not 403) when unauthenticated — don't reveal that the resource exists
- Validate race `is_locked` status before accepting predictions
- Rate limiting: not yet implemented — add before public launch

---

## Coding Style

### Naming
- Components: `PascalCase` (`RaceCard`, `PodiumPicker`)
- Hooks: `camelCase` with `use` prefix (`usePredictions`, `useRaceData`)
- Utilities/helpers: `camelCase` (`formatRaceDate`, `calculatePoints`)
- Constants: `SCREAMING_SNAKE_CASE` (`MAX_DRIVERS`, `POINTS_EXACT_MATCH`)
- Database columns: `snake_case` (follow Supabase convention)
- CSS classes: Tailwind utility classes only; no custom CSS unless Tailwind cannot express it

### Comments
- Only comment non-obvious logic — don't comment what the code clearly says
- Document the WHY, not the WHAT
- Business rules deserve comments (e.g., scoring logic, race lock conditions)

### Git Workflow
- Commit messages: `type(scope): description` — e.g., `feat(predictions): add validation for locked races`
- Types: `feat`, `fix`, `refactor`, `style`, `test`, `docs`, `chore`
- Never use `--no-verify` to bypass hooks
- Never force-push to `main`
- Branch naming: `claude/<short-description>-<session-id>` for automated branches

### Pre-Completion Checklist
Before marking any task complete:
1. TypeScript compiles without errors (`npm run build` or `tsc --noEmit`)
2. ESLint passes (`npm run lint`)
3. No `console.log` statements in changed files
4. No hardcoded secrets
5. RLS policies exist for any new database tables
6. API routes validate auth and inputs

---

## Design System

**Brand Colors**
- Primary red: `#E10600` (F1 red)
- Background: `#000000` (black)
- Text: `#FFFFFF` (white)
- Accent: `rgba(0, 210, 170, 1)` (F1 teal/cyan)

**Font**
- Titillium Web (Google Fonts, variable weight) — used across all text
- Monospace fallback for data/numbers: system monospace stack

**UI Aesthetic**
- Dark theme only
- F1 motorsport aesthetic: speed, precision, technical
- Interactive elements: neon glow effects, laser hover states
- Animations: smooth, purposeful — not decorative
- Mobile-first but desktop-rich

**When using UI UX Pro Max skill:** Frame requests as "motorsport/F1" domain. The skill has industry-specific palettes and design patterns — use the dark/racing aesthetic category.

---

## Installed Tooling

| Tool | Type | How installed | Purpose |
|------|------|--------------|---------|
| Superpowers | Marketplace skill pack | `/plugin install superpowers@claude-plugins-official` | TDD, debugging, code review workflows |
| Claude-Mem | Marketplace memory layer | `/plugin marketplace add thedotmack/claude-mem` then `/plugin install claude-mem` | Cross-session memory (ONLY memory layer) |
| UI UX Pro Max | Marketplace skill pack | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill` then `/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` | Design system generation for F1 UI |
| Supabase MCP | MCP server | See `.claude/settings.json` | Database operations via natural language |
| Context7 MCP | MCP server | See `.claude/settings.json` | Live Next.js/Supabase/React docs |
| GitHub MCP | MCP server | See `.claude/settings.json` | PR and issue management |

See `INTEGRATIONS_AUDIT.md` for the full evaluation of all considered tools.
See `INTEGRATIONS.md` for install steps and rollback instructions.
