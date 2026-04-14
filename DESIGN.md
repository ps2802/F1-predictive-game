# Design System — Gridlock

## Product Context
- **What this is:** F1 predictive game where users predict race podiums and compete globally and in private leagues
- **Who it's for:** F1 fans who want prediction-based competition with real stakes (USDC leagues)
- **Space/industry:** Sports prediction / fantasy sports / competitive gaming
- **Project type:** Authenticated web app (dashboard, prediction forms, league management)

## Aesthetic Direction
- **Direction:** Broadcast Telemetry — the visual language of F1 timing screens, sector data, and team radio displays
- **Decoration level:** Intentional — thin hairline dividers, segment rails, red accent used sparingly (like a marshal flag)
- **Mood:** The user should feel like they are inside a race, not browsing a SaaS dashboard. High-stakes, high-signal, premium dark. Every pixel earns its place.
- **What we are not:** A betting site template, a fantasy sports card grid, a generic dark SaaS app
- **Competitive gap:** Every F1 prediction app (official F1 Fantasy, FantasyGP, F1 Predictor) treats the sport as content to browse. Gridlock treats the user as a competitor inside the race. The design enforces that distinction.

## Branding
- **Logo:** Always use the logo image asset — never typeset "GRIDLOCK" as text. This applies everywhere: app nav, auth pages, waitlist, preview pages, and any marketing surface.
- **Logo asset:** Reference the image file used in the current AppNav and landing page implementation.
- **Text wordmark fallback:** Only acceptable in plain-text contexts (email subject lines, meta tags, page titles). Never in rendered UI.

## Typography
- **Font:** Titillium Web — one family, all weights. No other fonts.
  - This is the font used on actual F1 timing screens. Using it throughout is a deliberate authenticity signal, not a shortcut.
  - Load via Google Fonts: `family=Titillium+Web:wght@200;300;400;600;700;900`
- **Display / Hero:** Titillium Web 900, letter-spacing −0.01em, line-height 1
- **Heading:** Titillium Web 700
- **Subheading:** Titillium Web 600
- **Body:** Titillium Web 400, color: `--muted`, line-height 1.6
- **Labels / Metadata:** Titillium Web 600, uppercase, letter-spacing 0.14em, font-size 10–11px
- **Timing Numerics:** Titillium Web 700, `font-variant-numeric: tabular-nums`, letter-spacing 0.04em — used for countdown, rank, score, wallet balance
- **Font blacklist:** Never use Inter, Roboto, Arial, Helvetica, Open Sans, or any system font stack as a deliberate choice

## Color
- **Approach:** Restrained — color is a signal system, not decoration
- **Rule:** Red, teal, and amber each have exactly one meaning. When one appears, it carries weight. Never use them decoratively.

### Tokens
```css
--bg-0:     #050505;   /* Main background */
--bg-1:     #0D0D0D;   /* Panel surface */
--bg-2:     #111111;   /* Elevated surface, hover, race rows */
--bg-3:     #1A1A1A;   /* Pressed, selected state */
--red:      #E10600;   /* Primary action, urgency only */
--teal:     #00D2AA;   /* Success, active state, positive signal only */
--amber:    #FFD23C;   /* Warning, draft state only */
--text:     #FFFFFF;   /* Primary text */
--muted:    rgba(255,255,255,0.55); /* Secondary text, metadata */
--faint:    rgba(255,255,255,0.25); /* Tertiary text, disabled */
--border:   rgba(255,255,255,0.07); /* Default dividers */
--border-2: rgba(255,255,255,0.12); /* Emphasized dividers, input borders */
```

### Semantic usage
- **Red `#E10600`:** Primary CTAs (Predict Now, Submit), urgency badges (locked race, predict or miss), error states
- **Teal `#00D2AA`:** Predicted badge, active/selected state, positive rank delta (↑N), P1 league indicator, focus ring on keyboard nav
- **Amber `#FFD23C`:** Draft activation rail, time-pressure states only
- **Gold/Silver/Bronze:** Leaderboard P1/P2/P3 positions only (`#FFD700`, `#C0C8D0`, `#C87533`)

### Contrast requirements (WCAG AA)
- `#E10600` on `#050505`: ~4.2:1. Use `#FF1A17` for text below 18px to reach 4.5:1.
- `#00D2AA` on `#050505`: ~7.1:1. AAA. Safe at all sizes.
- `#FFFFFF` on `#0D0D0D`: ~19:1. AAA. Safe.
- `#FFD23C` on `#050505`: ~7.8:1. AAA. Safe.

### Gradients
- Allowed only in: (a) command band background — subtle top-to-bottom from `#0D0D0D` to `#050505`, (b) CTA hover sweep from left (red sweep)
- Never: decorative gradient blobs, purple/violet fills, blue-to-teal ambient backgrounds

## Spacing
- **Base unit:** 4px
- **Density:** Compact (this is a data-dense app, not a marketing site)
- **Scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64px
- **Section padding:** 64px vertical on design preview, 24–28px on app panels

## Layout
- **Approach:** Grid-disciplined. Rails and hard-edged panels. No card grids.
- **Core rule:** Do not use card grids (grid of equal-weight cards with shadows, rounded corners, icons). Every competitor uses them. We use data rows, rails, and panel splits.
- **Border radius:** 0px on data surfaces (panels, rows, dividers). Buttons may use a small radius if needed for touch affordance. No uniform bubbly border-radius on everything.
- **Max content width:** 1100px
- **Grid:** Full-width panels above the fold. 2-column splits for competitive row, component grids below.

### Dashboard layout hierarchy
1. Draft activation rail (amber, full width, only when drafts exist)
2. Command band: 2-column split (race/countdown left, telemetry stack right)
3. Competitive context row: 2-column split (Global Podium left, League Pressure right)
4. Season rail: full-width horizontal progress track
5. Schedule: full-width, 3-tier grouping (On Deck / Season Run / Settled)

### Responsive
- **Desktop (≥1024px):** Full 2-column layouts as above
- **Tablet (640–1023px):** Command band stays 2-column (may compress). Competitive row stays 2-column.
- **Mobile (<640px):** All sections stack vertically. Command band stack order: countdown+CTA first, then telemetry stack as 2×2 grid. Season rail collapses to `Round X of 24` pill + inline progress bar.

### Surfaces
- Data rows and panels: hard edges, hairline dividers (`--border`)
- No soft drop shadows on data surfaces
- Background layering: `--bg-0` → `--bg-1` → `--bg-2` for depth (never decorative gradients)

## Motion
- **Approach:** Intentional — motion communicates state and urgency, not decoration
- **Easing:** enter: ease-out, exit: ease-in, move: ease-in-out
- **Duration:** micro 50–100ms, short 150–250ms, medium 250–400ms

### In scope
- Live countdown: ticks every second (functional, always runs regardless of reduced-motion)
- Entrance reveals: section-level only, max 180ms total stagger. Order: command band (0ms) → competitive row (80ms) → season rail (140ms) → schedule (180ms). No per-item stagger within a section.
- Rank delta fade-in: teal/red delta indicator fades in after results are posted
- CTA hover: red sweep from left on primary button
- Settle expand/collapse: schedule settled group animate on toggle
- Focus transitions: focus ring appears instantly (no animation)

### Out of scope
- Animated car illustrations
- Parallax scroll effects
- Infinite decorative glow loops
- Per-item stagger within lists
- Ambient motion loops
- Any motion that blocks interaction or obscures data

### Reduced motion
- All entrance animations gated behind `@media (prefers-reduced-motion: no-preference)`
- Countdown tick always runs (functional, not decorative)

## Accessibility
### ARIA landmarks
- `<main>` wraps full dashboard content below AppNav
- Named sections: `<section aria-label="Race Command">`, `<section aria-label="Global Standings">`, `<section aria-label="Your Leagues">`, `<section aria-label="Season Progress">`, `<section aria-label="Race Schedule">`

### Keyboard navigation
- All race rows: keyboard-focusable (`tabIndex={0}`, `role="link"` or actual `<a>`)
- Tab order follows visual order
- Focus ring: `outline: 2px solid #00D2AA` on `:focus-visible`. Never `outline: none` without replacement.

### Countdown timer
- Timer element: `aria-live="off"` (prevents screen reader noise on every tick)
- Visually hidden sibling: `<span className="sr-only">Qualifying in approximately {hours} hours</span>`, updated every 10 minutes

## Interaction States
### Loading skeleton
- Shimmer: `background: linear-gradient(90deg, #111 25%, #1a1a1a 50%, #111 75%)` at 1.5s
- Structure mirrors live layout (command band → competitive row → schedule rows)
- No spinner, no "Loading..." text

### Error state
- Copy: `RACE CONTROL OFFLINE` (10px uppercase red label) + one-line reason + teal `Retry` button
- AppNav always visible so user can navigate away

### Empty states
- No upcoming race: `NEXT RACE TBD` in command band, countdown shows `— : — : —`, CTA becomes `View Season Schedule`
- No leagues: League Pressure converts to `Create a League` (red primary) + `Join with Code` (teal outline). No placeholder card grid.
- New user / zero predictions: leaderboard shows top 3, self-row hidden, amber nudge below ("Make your first prediction")
- Zero wallet balance: show `$0.00 USDC` — never hide this row

### Draft activation
- Amber rail above command band when `draftCount > 0`
- `Activate in a League` opens inline modal with per-league activate buttons (not navigation)

## CSS Architecture
- Global tokens live in `globals.css` as CSS custom properties
- `DashboardPage.module.css` imports or extends global tokens — never redefines `--red`, `--teal`, `--amber`, or background values locally
- Inline token overrides in component files acceptable only for one-off values not in the global scale

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Titillium Web as sole font | Actual F1 timing screen font — authenticity signal, not compromise |
| 2026-04-11 | No card grids anywhere | Every competitor uses them — rails and panels are the visual differentiation |
| 2026-04-11 | Color as signal system (Red/Teal/Amber have one meaning each) | Marshal flag logic — color carries weight only when used sparingly |
| 2026-04-11 | Logo image everywhere, never typeset text | Brand consistency, user request |
| 2026-04-11 | 4px base unit, compact density | Data-dense app, not a marketing site |
| 2026-04-11 | Entrance stagger max 180ms, section-level only | Prevents decorative animation creep |
| 2026-04-11 | Countdown aria-live=off with static sr-only sibling | Live countdowns are extremely noisy for screen readers on 1s intervals |
