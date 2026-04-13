# Gridlock — Figma Design System Rules

> Used by the Figma MCP to translate designs into production code for this codebase.

---

## 1. Design Tokens

No token transformation system (no Style Dictionary, no Tailwind theme). Tokens are hardcoded as CSS literals. When implementing from Figma, map values directly to these constants:

### Colors

```css
/* Backgrounds */
--bg-base:    #060606   /* page background */
--bg-panel:   #0D0D0D   /* cards, panels, nav */
--bg-panel2:  #131313   /* nested surfaces */

/* Brand */
--red:   #E10600        /* primary CTAs, highlights, active states */
--teal:  #00D2AA        /* winnings, success, secondary accent */
--gold:  #FFD23C        /* warnings, draft states */

/* Text hierarchy (always white-on-black) */
--text-primary:   #FFFFFF
--text-secondary: rgba(255,255,255,0.65)
--text-muted:     rgba(255,255,255,0.45)
--text-faint:     rgba(255,255,255,0.28)

/* Borders */
--border:        rgba(255,255,255,0.07)
--border-strong: rgba(255,255,255,0.14)
```

**Rules:**
- Never use opacity lower than 0.45 for readable text
- Never use a light background — dark theme only
- Red is ONLY used for primary CTAs and urgent states; never for decoration
- Teal is ONLY used for financial values (winnings, prizes) and success states

---

## 2. Typography

**Font**: Titillium Web (Google Fonts), loaded via Next.js `next/font/google`

```typescript
// app/layout.tsx
const titillium = Titillium_Web({
  subsets: ['latin'],
  weight: ['200', '300', '400', '600', '700', '900'],
  variable: '--font-titillium',
  display: 'swap',
});
```

### Scale

| Role | Size | Weight | Letter-spacing | Notes |
|------|------|--------|---------------|-------|
| Hero title | `clamp(52px, 8vw, 96px)` | 900 | `-0.07em` | Race names, page titles |
| Section title | `clamp(32px, 5.5vw, 62px)` | 900 | `-0.06em` | Dashboard headers |
| Stat value | `clamp(28px, 3.2vw, 42px)` | 800–900 | `-0.05em` | Points, prices, counts |
| Card name | 16–18px | 800 | `-0.02em` | League names, race names |
| Body | 13–15px | 600 | `0.01em` | Descriptions, meta |
| Label / eyebrow | 10–12px | 800 | `0.18–0.28em` | Uppercase section labels |
| Micro | 9–11px | 800 | `0.14em` | Badges, pills, timestamps |

**Rules:**
- Headlines always uppercase, tight letter-spacing (negative)
- Labels/eyebrows always uppercase, wide letter-spacing (positive)
- Body text never uppercase
- `font-variant-numeric: tabular-nums` on all numeric displays (points, countdown, rank)
- Line height on headlines: `0.85–0.9`; body: `1.45–1.55`

---

## 3. Component Architecture

**Framework**: Next.js 16 App Router, React 19, TypeScript

**Styling**: Dual approach
1. `app/globals.css` — global styles using BEM-like `.gla-*` prefix for nav and shared UI
2. `app/dashboard/DashboardPage.module.css` — CSS Modules (camelCase) for dashboard-specific components

**No UI library** — everything built from scratch. No shadcn, Radix, Material-UI.

**Component pattern** (all components in `app/components/`):

```typescript
// Server Component by default
export function ComponentName({ prop }: Props): React.JSX.Element {
  return <div className="gla-component-name">...</div>
}

// Client Component (only when needed)
'use client'
export function ComponentName({ prop }: Props): React.JSX.Element {
  return <div className={styles.componentName}>...</div>
}
```

**When to use CSS Modules vs globals:**
- New page-level components → CSS Modules (`ComponentName.module.css`)
- Shared atoms reused across pages → `globals.css` with `.gla-` prefix
- Inline styles → never (except for dynamic values like `width: ${pct}%`)

---

## 4. Button System

Three tiers. Only one primary CTA per viewport section.

```css
/* Primary — red glow, dominant */
.btn-primary {
  height: 48–52px; padding: 0 32–36px;
  font-size: 12–14px; font-weight: 800; letter-spacing: 0.1–0.18em; text-transform: uppercase;
  background: #E10600; color: #fff; border: none;
  box-shadow: 0 0 0 1px rgba(225,6,0,0.6), 0 6px 26px rgba(225,6,0,0.4);
}

/* Secondary — ghost border */
.btn-secondary {
  height: 34–38px; padding: 0 18–22px;
  font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
  background: transparent; border: 1px solid rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.8);
}

/* Tertiary — text link */
.btn-link {
  font-size: 12–13px; font-weight: 700;
  background: none; border: none;
  color: rgba(255,255,255,0.55);
  text-decoration: underline; text-underline-offset: 3px;
}

/* Small action (inline in list rows) */
.btn-sm {
  height: 30–32px; padding: 0 16–18px;
  font-size: 10–11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
  background: #E10600; color: #fff;
  box-shadow: 0 0 0 1px rgba(225,6,0,0.5), 0 2px 10px rgba(225,6,0,0.22);
}
```

**Microcopy rules for buttons:**
- `Make Picks →` not "Pick Podium" or "Submit"
- `Edit Picks` not "Update" or "Modify"
- `Join Free →` not "Join" or "Enter"
- `Create a league →` not "New League"
- Never use "Click here" or "Submit"

---

## 5. Status Pills

Used in league rows to show per-race prediction state. Always contextual, never decorative.

```css
/* Pick due — red, urgent */
.pill-due { background: rgba(225,6,0,0.1); border: 1px solid rgba(225,6,0,0.3); color: #ff7070; }

/* Submitted — teal, confirmed */
.pill-sub { background: rgba(0,210,170,0.09); border: 1px solid rgba(0,210,170,0.28); color: #00D2AA; }

/* Locked — grey, inactive */
.pill-locked { border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.42); }

/* Results pending — gold, waiting */
.pill-pending { background: rgba(255,210,60,0.07); border: 1px solid rgba(255,210,60,0.22); color: rgba(255,210,60,0.8); }
```

**Allowed labels** (exact copy):
- `Pick due` — prediction not yet made
- `Submitted` — prediction made, editable
- `Locked` — qualifying passed, no changes
- `Results pending` — race finished, scoring in progress

**Forbidden labels**: "Open", "Live", "Active", "Closed", "Available"

---

## 6. Layout & Spacing

```
Page max-width: 1040–1060px (centered, margin: 0 auto)
Page horizontal padding: 48px (32px on smaller viewports)
Section gap: 28–36px between major sections
Component internal padding: 16–22px
List row padding: 16–20px top/bottom, 0 horizontal (relies on page padding)
```

**Section dividers**: `1px solid rgba(255,255,255,0.07)` — never use heading-style section breaks

**Hierarchy via space, not boxes:**
- Primary content: no box, just space
- Secondary content: light hairline above
- Tertiary / metadata: reduced opacity only

**No panels or card borders on hero sections** — the hero dominates through scale and space, not framing.

---

## 7. Hero Section Pattern

Every dashboard view has one dominant hero. Structure:

```
[eyebrow]     Round 4 · 2026 Season           11px, uppercase, 0.28em spacing, 0.5 opacity
[title]       MIAMI                            96px, 900 weight, −0.07em
              GRAND PRIX
[meta]        🇺🇸 Circuit Name · Date          14px, 0.65 opacity
[countdown]   27d : 20h : 55m : 00s           52px numbers, red on days
[status]      ● No picks yet                  13px, 0.65 opacity, pulsing dot
[CTA]         [Make Picks →]                  Primary button, only one
```

**Decorative element**: Large faint round number (e.g. `04`) positioned right side as background graphic — `font-size: clamp(200px, 28vw, 320px)`, `-webkit-text-stroke: 1px rgba(255,255,255,0.045)`, `color: transparent`.

---

## 8. Icon System

**No icon library installed.** Current approach:
- Country flags: emoji (`🇺🇸`, `🇬🇧`, `🇮🇹`)
- Status indicators: CSS `border-radius: 50%` dots with brand colors
- Loading: CSS `@keyframes spin` animation
- Decorative: Large faint text/numbers as background elements

**If adding icons**: Use inline SVG or a minimal library like `lucide-react`. Do not use emoji for functional icons.

---

## 9. Motion

```css
/* Standard transition */
transition: property 140–180ms ease;

/* Hover lift */
transform: translateY(-1px);

/* Pulse (urgent state dots) */
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
animation: pulse 1.8s ease-in-out infinite;

/* Entrance */
@keyframes riseIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
animation: riseIn 300ms ease-out both;
```

**Rules:**
- No decorative animation — every animation must communicate state or aid comprehension
- Entrance animations max 300ms, no delay on primary content
- Hover effects: lift (`translateY(-1px)`) + glow increase only
- Never animate layout properties (width, height, padding)

---

## 10. Dashboard States

### Zero State (first-time user)
Remove: stats, tabs, search, rank, points, large league grids
Show: race hero + game loop sentence + single primary CTA + 3-step how-it-works + 1 featured league + 2 public league rows + invite code link

### Engaged State (returning user)
Above fold: race hero + prediction status + single contextual CTA
Below: inline stats row (3 items max, no boxes) + league rows (horizontal, not grid)

---

## 11. File Conventions

```
app/
  components/            # Shared atoms only (AppNav, etc.)
  [feature]/
    page.tsx             # Server Component, thin shell
    [Feature]Client.tsx  # Client Component with data + rendering
    [Feature].module.css # Scoped CSS Module for this feature
```

- Max file: 800 lines
- CSS Module classes: camelCase (`statsStrip`, `leagueRow`, `predStatus`)
- Global classes: `.gla-[component]-[element]` (BEM-like)
- No `console.log` in committed code
- No hardcoded secrets
