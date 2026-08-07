---
name: GFD Recruit Testing
description: The purpose-built grading tool for live fire-department practical tests
colors:
  brand-navy: "#12123a"
  brand-navy-2: "#1c1c56"
  brand-red: "#c4212f"
  brand-gold: "#d3a85f"
  bg: "#f4f4f7"
  surface: "#ffffff"
  text: "#1c1c28"
  text-secondary: "#6b6b76"
  text-muted-strong: "#4a4a54"
  border: "#e1e1e8"
  success: "#1f8a3b"
  status-pass-muted: "#6b9e7a"
  status-fail-muted: "#b5555f"
  flag-amber: "#b45309"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "clamp(1.6rem, 6vw, 2rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  kpi:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "17-20px"
    fontWeight: 700-800
    lineHeight: 1.15
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11-13px"
    fontWeight: 700
    letterSpacing: "0.04-0.1em"
  compact:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500-700
    lineHeight: 1.2-1.4
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.brand-navy}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "14px"
  button-primary-danger:
    backgroundColor: "{colors.brand-red}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "14px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.brand-navy}"
    rounded: "{rounded.lg}"
    padding: "12px"
---

# Design System: GFD Recruit Testing

## Overview

**Creative North Star: "The Instrument Panel"**

The app reads like dependable fire-service equipment, not software borrowing the metaphor: a timer banner is a readout, a KPI tile is a gauge, a status badge is a warning light that never relies on color alone. Every surface answers one question fast — whose turn, which step, pass or fail, time remaining — and gets out of the way. The navy/gold/red institutional palette does the identity work; craft shows up in restraint, not ornament.

Confirmed rejections: no mascots, badges-as-rewards, streaks, confetti, or candy colors (this isn't gamified-consumer). No cramped gray tables or 1990s admin density either (this isn't legacy government software). No animation, transition, or visual richness that could cost an evaluator a beat mid-test — motion earns its place only by making a state easier to read.

**Key Characteristics:**
- Navy-gradient command surfaces (top bar, timer banners, dashboard canvas) bordered by a thin gold rule — the one recurring signature across the whole app.
- Flat, bordered cards at rest; a raised variant (real shadow, no border) reserved for tappable tiles that want to read as "equipment," not paper.
- Status is always redundant: color + text/icon together, never color alone.
- System font stack, not a custom display face — legibility in daylight over typographic personality.

## Colors

Institutional navy/gold/red, kept restrained: navy carries authority and structure, gold marks the one accent rule (used sparingly, as a signature line), red is reserved for danger/fail so it stays alarming.

### Primary
- **Command Navy** (#12123a): the app's structural color — top bar, timer banners, primary buttons, headings, dashboard canvas gradient (paired with #1c1c56 as its second stop).
- **Signal Gold** (#d3a85f): the one accent. A 3px rule under the top bar and timer banners, the KPI accent tick, the focus-visible ring, the login title's underscore. Used thin and sparing — its rarity is the point.

### Secondary
- **Alert Red** (#c4212f): danger actions, fail status, destructive buttons. Never doubles as decoration.
- **Confirm Green** (#1f8a3b): pass status, success actions. Paired with muted variants (#6b9e7a pass / #b5555f fail) for lower-emphasis pass/fail buttons where full-saturation would be too loud.

### Neutral
- **Paper** (#f4f4f7): page background.
- **Surface White** (#ffffff): cards, inputs, the top bar's opposite — anything that needs to read as a discrete panel.
- **Ink** (#1c1c28): primary text.
- **Slate** (#6b6b76): secondary text, labels, captions — AA-compliant (~4.8:1) on Paper.
- **Slate Strong** (#4a4a54): the outdoor-legibility escape hatch — used wherever secondary-weight text must clear a stronger contrast floor (~7-8:1) for bright-sun reading (form hints, badge text on tinted backgrounds).
- **Hairline** (#e1e1e8): borders, dividers.

### Category Tags
Eight deterministic hues (`.category-tag--0` through `--7`, assigned by `src/lib/categoryColor.js`), each a saturated text color over a 10%-alpha tint of itself: `#1d4ed8` blue, `#0e7490` cyan, `#0f766e` teal, `#4338ca` indigo, `#6d28d9` violet, `#a21caf` magenta, `#334155` slate, `#0369a1` sky. A scanning aid across a long question list in the Test Bank builder, not decoration — deliberately kept out of the green/red family already claimed by pass/fail semantics.

### Named Rules
**The One Accent Rule.** Signal Gold appears only as a thin rule, tick, or ring — never as a fill or a large surface. Its scarcity is what makes it read as a signature rather than a third primary color.

**The Redundant Signal Rule.** Pass, fail, and any other status that carries weight is never color-only. It always pairs with text, an icon, or both, so it survives glare and color blindness.

## Typography

**Body/Display Font:** -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif

**Character:** The platform's own system face, deliberately — legibility at a glance in daylight outranks a bespoke display font. Weight and size carry hierarchy instead of a second typeface.

### Hierarchy
- **Display** (800, `clamp(1.6rem, 6vw, 2rem)`, 1.1, -0.02em): login/entry titles only.
- **KPI Value** (800, 32px, 1, tabular-nums): dashboard/reporting numbers — the one place a number needs to read like a gauge readout.
- **Title** (700-800, 17-20px, 1.15): page/section/dashboard-tile titles.
- **Body** (400, 16px, 1.4): form inputs, running text. 16px minimum on inputs specifically prevents iOS auto-zoom.
- **Compact** (500-700, 14px, 1.2-1.4): the step between Label and Body — field labels, form-alert text, dashboard tile/subtitle text, segmented-control text. Not in the original ramp; documented here because it's used consistently (6+ sites) rather than drifted into.
- **Label** (700, 11-13px, letter-spacing 0.04-0.1em, often uppercase): eyebrows, section labels, badges — the small-caps instrument-panel caption voice.

### Named Rules
**The Numeric Readout Rule.** Any value a user reads at a glance under time pressure (KPI tiles, timers) uses `font-variant-numeric: tabular-nums` so digits never visually jitter as they change.

## Layout

Single reading/form column at 720px max-width (`.screen`) for anything the evaluator works through step by step; a 1180px wide tier (`.screen--wide`) for grids and reports that benefit from tablet/desktop space. No fluid in-between: grids use `auto-fill`/`auto-fit` + `minmax()` so column count adapts without named breakpoints, with two deliberate exceptions (`700px` for the KPI row's 2→4 column jump, `960px` for the test-bank builder's single-column→two-pane split). `env(safe-area-inset-top)` clears the iOS notch/Dynamic Island on every sticky top surface. Base spacing rhythm runs in a loose 6/10/16/20px scale; card padding is 16px.

## Elevation & Depth

Two-tier, restrained: a flat 1px-bordered `.card` at rest, and a raised variant (`.card--raised`: no border, real shadow) for surfaces that should read as tappable equipment — dashboard tiles, recruit tiles, KPI tiles. Interactive tiles add a hover-lift (translateY -2px + deeper shadow) gated to `@media (hover: hover)` so it never sticks on touch, and settle flat again on press. Everything respects `prefers-reduced-motion: reduce`.

### Shadow Vocabulary
- **shadow-sm** (`0 2px 6px rgba(18, 18, 58, 0.12)`): default card border-adjacent lift, list chrome.
- **shadow-md** (`0 4px 14px rgba(18, 18, 58, 0.18)`): raised cards, primary buttons, pressed-tile rest state.
- **hover-lift** (`0 10px 22px rgba(0, 0, 0, 0.18)`): transient hover state on dashboard/recruit tiles only.

### Named Rules
**The Press-Settles Rule.** A tile's hover lift always has a matching `:active` state that returns it to `shadow-md`, not back to flat — depth communicates "still armed," never "now inert."

## Shapes

14px radius (`--radius`) is the default for cards, primary/secondary buttons, and the login panel — soft enough to feel considered, not so soft it reads playful. Form inputs step down to 10px. Anything meant to read as a chip, tile-badge, or filter (badges, chips, test tiles, sequence numbers) goes full pill (999px). No sharp corners anywhere in the system; no corner exceeds 14px outside the pill tier.

## Components

### Buttons
- **Shape:** 14px radius, full-width by default.
- **Primary:** Command Navy fill, white text, `shadow-md`. Color variants swap the fill only (danger/success/warning/pass-muted/fail-muted) — shape and shadow language stay constant. `pass-muted` uses dark ink text, not white — the fill is too light for white text to clear AA.
- **Secondary:** transparent fill, navy text, hairline border — never competes with a primary action on the same screen.
- **Grade-pending:** the un-decided state of a Pass/Fail pair (`GradeButtons.jsx`) — same shape/sizing as Secondary, used so an ungraded control never renders as a washed-out, low-contrast fill.
- **Focus:** every interactive element gets a 3px Signal Gold `:focus-visible` outline, keyboard/switch-only (never on pointer tap).

### Modals
Every overlay in the app — confirmations, forms, the live-test-runner's mid-test popups — routes through the shared `Modal.jsx` shell: `role="dialog"`, a focus trap, Escape-to-close, backdrop-click-to-close, and focus restoration to whatever triggered it, on the standard `--overlay-scrim` backdrop. A modal that has no cancel concept (e.g. a "pick your next step" screen) sets `dismissible={false}` rather than inventing a one-off overlay. Nested modals (a confirm opened from a form) resolve Escape/focus-trap by stack order, innermost first.

### Icon System
One restrained, single-stroke-weight line-icon set (`Icon.jsx`, 1.75 stroke) spans the whole app — dashboard navigation, live-test-runner glyphs (info/timer/note/camera/play/pause/stop). No raw emoji anywhere in the UI: emoji render inconsistently across OS/browser and undercut the "instrument panel," not "casual app," reading.

### Badges
- **Style:** pill, uppercase, letter-spaced 0.04em, 12px/700.
- **State:** pass/fail/neutral/critical variants are tint + saturated text, never a bare color fill — text stays legible on the tint.

### Cards / Tiles
- **Corner Style:** 14px.
- **Flat vs. raised:** flat-bordered at rest by default; raised (shadow, no border) only for genuinely tappable tiles.
- **Status accent:** a 4px left border in pass/fail/progress color when a card represents graded state — the border is the redundant-signal cue paired with text elsewhere on the card.

### Inputs / Fields
- **Style:** 10px radius, hairline border, white surface, persistent field-label above (not placeholder-as-label) so identity survives once the user starts typing.
- **Focus:** the shared gold `:focus-visible` ring.
- **Error:** inline, field-scoped red text below the field, wired to `aria-describedby`.

### Navigation
- **Top Bar:** sticky, navy-gradient, 3px gold bottom rule, safe-area-aware padding. Icon buttons hold a 44×44px minimum hit area regardless of glyph size — the glove-ready floor applies everywhere, not just primary actions.

### Timer Banners (signature component)
Sticky, navy-gradient, gold-bordered — the same instrument-panel surface as the top bar, reused so a timer always reads as "the same kind of authoritative readout" wherever it appears (per-step timer, whole-test timer). The whole-test variant stacks Pause/Resume/Stop as full-width, 52px-minimum thumb targets below the readout rather than beside it, because the evaluator watching this is often watching the recruit, not the screen.

### KPI Tiles (signature component)
Flat card, small gold accent tick under an uppercase eyebrow label, then a large tabular-nums value in Command Navy (or Alert Red for an alert state). The dashboard's one deliberately gauge-like reading — everything else in the system stays quieter than this.

## Do's and Don'ts

### Do:
- **Do** pair every status color with text or an icon (The Redundant Signal Rule).
- **Do** keep interactive hit areas at 44×44px minimum, larger where a timed decision is made under pressure.
- **Do** gate all hover states behind `@media (hover: hover)` and provide a `prefers-reduced-motion` fallback for every transition/animation.
- **Do** use Signal Gold only as a thin rule, tick, or ring.
- **Do** route every overlay through `Modal.jsx` — never hand-roll a new `position:fixed;inset:0` backdrop.
- **Do** use `Icon.jsx` for any new glyph — never a raw emoji character.

### Don't:
- **Don't** introduce a second display typeface — hierarchy comes from weight/size, not a new font.
- **Don't** add decorative motion (parallax, slow fades, staggered reveals) to any surface an evaluator uses mid-test.
- **Don't** let a card's status accent be the only signal — always pair with a badge or text elsewhere on the card.
- **Don't** fill a surface with Signal Gold; it stays a line, not a field.
- **Don't** render an undecided/pending control as a low-contrast fill — use `.grade-pending` (or an equivalent outline treatment), never an inline gray override.
