# Analytics Events

Gridlock uses:

- `PostHog Cloud` for product and acquisition analytics
- `Microsoft Clarity` for session replay and heatmaps
- `Vercel Speed Insights` for Core Web Vitals

## Environment

- `NEXT_PUBLIC_ANALYTICS_ENABLED=true` enables analytics in the browser and on the server
- `NEXT_PUBLIC_POSTHOG_KEY` is the PostHog project key for `posthog-js`
- `POSTHOG_API_KEY` is the PostHog server key for trusted server-side capture
- `NEXT_PUBLIC_POSTHOG_HOST` defaults to `https://us.i.posthog.com`
- `NEXT_PUBLIC_CLARITY_PROJECT_ID` enables Microsoft Clarity in production

Preview deployments should leave `NEXT_PUBLIC_ANALYTICS_ENABLED=false` unless they use a separate analytics project.

## Privacy Rules

Never send:

- email addresses
- wallet addresses
- raw invite codes
- raw prediction answers
- access tokens
- full transaction hashes

Clarity masking is explicitly applied to:

- profile identity card
- wallet balances and transaction tables
- wallet address displays
- invite-code inputs
- withdrawal destination inputs

## Event Taxonomy

### Acquisition

- `landing_viewed`
- `landing_cta_clicked`
- `how_it_works_clicked`

### Auth and onboarding

- `login_viewed`
- `auth_started`
- `auth_completed`
- `auth_failed`
- `onboarding_viewed`
- `onboarding_completed`
- `onboarding_skipped`

### Core gameplay

- `dashboard_viewed`
- `race_card_clicked`
- `prediction_started`
- `prediction_step_completed`
- `prediction_saved_draft`
- `prediction_submitted`
- `prediction_submit_failed`
- `prediction_edit_started`
- `prediction_edit_submitted`

### Competition and wallet

- `leaderboard_viewed`
- `profile_viewed`
- `league_create_started`
- `league_created`
- `league_join_attempted`
- `league_joined`
- `league_join_failed`
- `wallet_viewed`
- `withdrawal_started`
- `withdrawal_requested`
- `withdrawal_failed`

### Operations

- `race_locked`
- `race_scored`
- `league_settled`

## Ownership

- Client-only UX events go through [lib/analytics.ts](/Users/praneetsinha/conductor/workspaces/f1-predictive-game/san-francisco/lib/analytics.ts)
- Trusted server conversion events go through [lib/analytics.server.ts](/Users/praneetsinha/conductor/workspaces/f1-predictive-game/san-francisco/lib/analytics.server.ts)
