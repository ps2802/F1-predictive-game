# Gridlock Web2 — Release Runbook

Copy-and-run steps to finish the Web2 conversion: apply the de-monetization
migration, runtime-verify on the preview, and promote to production
(`joingridlock.com`). Do these **in order**.

> Project facts
> - Supabase project: **Gridlock Main**, ref **`iklfpkyfarjqnmpyuufx`** (region `ap-northeast-1`). The unrelated `sonaris` project must NEVER receive this migration.
> - Migration file: `supabase/migrations/202606270001_web2_demonetize.sql` (**destructive** — drops money tables/columns).
> - PR: **#56** — head `claude/sync-2026-grid` → base `claude/access-linear-f1-kanban-XHIYt`.

---

## 0. Preconditions (clear these first)

1. **Un-pause Supabase** (org is at the 2-project free limit → pause/delete
   `sonaris` or upgrade, then restore Gridlock Main). Confirm it is **ACTIVE_HEALTHY**.
2. **Vercel preview Deployment Protection** — turn it off for previews, OR issue a
   Protection Bypass for Automation token and export it as
   `VERCEL_AUTOMATION_BYPASS_SECRET`.
3. Pull the real env for local/preview work (never hardcode keys):
   ```bash
   vercel link            # once, if not linked
   vercel env pull .env.local --environment=production --yes
   ```

---

## 1. Apply the migration — to Gridlock ONLY

**Pre-flight — positively confirm the target is Gridlock, not sonaris:**
```bash
# Expect: name "Gridlock Main", ref iklfpkyfarjqnmpyuufx, status ACTIVE_HEALTHY
supabase projects list | grep -i gridlock
```

### Option A — Supabase MCP (recommended)
Call `apply_migration` with:
- `project_id`: `iklfpkyfarjqnmpyuufx`  ← **verify this is Gridlock before running**
- `name`: `web2_demonetize`
- `query`: the full contents of `supabase/migrations/202606270001_web2_demonetize.sql`

### Option B — psql / Supabase CLI
```bash
# DATABASE_URL must point at db.iklfpkyfarjqnmpyuufx.supabase.co (Gridlock).
export SUPABASE_DB_URL='postgresql://postgres:<DB_PASSWORD>@db.iklfpkyfarjqnmpyuufx.supabase.co:5432/postgres'
echo "$SUPABASE_DB_URL" | grep -q iklfpkyfarjqnmpyuufx || { echo "WRONG PROJECT — abort"; exit 1; }
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202606270001_web2_demonetize.sql
```

**What it drops** (expect these gone afterward): tables `transactions`,
`deposit_events`, `edit_events`, `fee_wallet`, `payout_holds`,
`withdrawal_holds`, `held_payout_reserves`, `platform_fund_adjustments`,
`league_race_settlements`; views `fee_wallet_total`, `league_leaderboard`;
columns `profiles.{balance_usdc,wallet_address,privy_user_id,is_beta_account,payouts_frozen}`,
`leagues.{entry_fee_usdc,prize_pool,payout_model,payout_config}`,
`league_members.{paid,stake_amount_usdc}`; and the money RPCs
(`create/join/top_up_league_stake`, `apply_league_settlement`,
`record_normalized_deposit`, `atomic_deduct_balance`, `credit_user_balance`,
`credit_fee_wallet`, `increment_*`). It **adds** `races.lock_time_utc`, rewrites
`handle_new_user` + `record_prediction_submission` money-free, and tightens the
`leagues` SELECT RLS policy.

**Verify the migration landed (copy-run):**
```sql
-- money tables gone (expect 0 rows)
select table_name from information_schema.tables
 where table_schema='public'
   and table_name in ('transactions','fee_wallet','payout_holds','league_race_settlements');
-- money columns gone (expect 0 rows)
select column_name from information_schema.columns
 where table_schema='public' and table_name='profiles' and column_name='balance_usdc';
-- functions are the money-free versions (inspect the bodies)
select pg_get_functiondef('public.handle_new_user'::regproc);
select prosrc from pg_proc where proname='record_prediction_submission';
-- new lock anchor exists
select column_name from information_schema.columns
 where table_schema='public' and table_name='races' and column_name='lock_time_utc';
-- league read policy is the hardened one
select polname, pg_get_expr(polqual, polrelid) from pg_policy
 where polrelid='public.leagues'::regclass and polcmd='r';
```
Confirm: `handle_new_user` has **no** `balance_usdc`/`transactions` writes, and
`record_prediction_submission` has **no** balance/edit-fee/`credit_fee_wallet`
logic (answers + version snapshot only).

**Re-seed the live calendar/lock times from Jolpica (so `lock_time_utc` is real):**
```bash
SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... npm run seed:races
```

---

## 2. Runtime-verify on the live preview

Set the preview URL + (if protection is on) the bypass token, then run the
canary and the RLS proofs **against the preview** — this is the real gate, not
code inspection.
```bash
export E2E_BASE_URL="https://f1-predictive-game-git-claude-sync-2026-grid-ps2802s-projects.vercel.app"
# from `vercel env pull`: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
# optional: export VERCEL_AUTOMATION_BYPASS_SECRET=...

npx playwright install --with-deps chromium     # first run only
npx playwright test web2-canary       # journeys: dashboard, predict→active, edit, after-lock 403, league create/join, leaderboard, settled read-only
npx playwright test rls-security      # private-league hidden, leaderboard IDOR 403, cross-user prediction read/write denied
```
All journey + RLS tests must be **green** (tests with no eligible live data —
e.g. no locked/settled race yet — self-skip with a printed reason; that is not a
failure).

### Three OpenF1 track-map modes — force + confirm each renders
The mode is auto-selected by `/api/openf1/state`. Check the resolver, then load
the dashboard and confirm the Canvas (`[aria-label="Track map"]`) renders — never
blank, never an error.
```bash
curl -s "$E2E_BASE_URL/api/openf1/state" | jq '{mode, session, nextRace, liveCredentialPresent}'
```
- **static** — forced when a live F1 session is in progress and `OPENF1_API_KEY`
  is unset (OpenF1 gates historical too): expect `mode:"static"`, dashboard shows
  the silhouette + next-race countdown.
- **replay** (default) — outside session hours with no key: expect
  `mode:"replay"`, cars loop the most recent completed session.
- **live** — set `OPENF1_API_KEY` in Vercel env **and** during a live session:
  expect `mode:"live"`, dots update. (No key ⇒ live stays idle by design; replay
  carries the feature — not a failure.)

### Lock + RLS spot-checks (in addition to the specs)
```bash
# After-lock write rejected (use a locked raceId from the DB):
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$E2E_BASE_URL/api/predictions/v2" \
  -H 'content-type: application/json' --cookie "<authed-cookie>" \
  -d '{"raceId":"<LOCKED_RACE_ID>","answers":{"<qid>":["<optid>"]}}'   # expect 403
# Outsider blocked from a private league's leaderboard:
curl -s -o /dev/null -w "%{http_code}\n" "$E2E_BASE_URL/api/leagues/<PRIVATE_ID>/leaderboard" \
  --cookie "<non-member-cookie>"                                        # expect 403
```

### Lighthouse (landing + dashboard, mobile + desktop)
```bash
npx -y lighthouse "$E2E_BASE_URL/" --preset=desktop --only-categories=performance,accessibility,best-practices,seo --quiet --chrome-flags="--headless" --output=json --output-path=./.e2e-artifacts/lh-landing-desktop.json
npx -y lighthouse "$E2E_BASE_URL/" --form-factor=mobile --only-categories=performance,accessibility,best-practices,seo --quiet --chrome-flags="--headless" --output=json --output-path=./.e2e-artifacts/lh-landing-mobile.json
# Dashboard is authed — run Lighthouse with the injected Supabase cookie via --extra-headers, or use the Playwright trace. Record all four scores.
```
Confirm: no console errors, no failed network requests, **no direct browser calls
to `api.openf1.org`** (the canary asserts this), and the Canvas/track-map +
Hyperspeed code stay out of the critical dashboard bundle (they are
`next/dynamic({ ssr:false })`). Check the bundle:
```bash
npm run build   # inspect the /dashboard First Load JS line; confirm TrackMap chunk is separate/lazy
```

---

## 3. Promote to production (`joingridlock.com`)

Vercel auto-deploys `main` to the apex domain. Promote the chain:
```bash
# 1) Merge the work into the Conductor target branch:
gh pr merge 56 --squash --delete-branch=false
# 2) Open + merge target → main (resolve any divergence first):
gh pr create --base main --head claude/access-linear-f1-kanban-XHIYt \
  --title "Gridlock Web2 conversion → production" --body "See PR #56."
gh pr merge --squash   # on that new PR, once checks pass
```
Then watch the production deploy and smoke the apex:
```bash
gh api repos/ps2802/F1-predictive-game/commits/main/status --jq '.state'
curl -sI https://www.joingridlock.com/ | grep -i location    # expect 308 → https://joingridlock.com
curl -s https://joingridlock.com/ | grep -o '<title>[^<]*</title>'   # "Gridlock, Predict F1 races. Beat your friends."
curl -s https://joingridlock.com/api/openf1/state | jq '.mode'        # live | replay | static — never error
```
Production smoke = repeat the §2 checks against `https://joingridlock.com`
(Google sign-in completes, dashboard + track map render, a prediction saves as
active, a friend joins a private league by link).

---

## Rollback
The migration is destructive and not reversible from the app. If §1 must be
undone, restore from the Supabase point-in-time/backup taken **before** applying
(take one first if the plan supports it). Code rollback = revert the merge
commits and redeploy.
