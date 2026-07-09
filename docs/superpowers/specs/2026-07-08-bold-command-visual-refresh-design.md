# Bold Command Visual Refresh — Design

## Goal

Visual polish pass for GFD Recruit Testing, across the whole app. No UX/flow
changes, no new features — purely how it looks. Direction: "Bold Command" —
a bolder, more official-feeling department tool (stronger navy/gold/red
contrast, status color-bars, heavier CTAs), chosen over a "Refined Minimal"
tightening of the current look and a lighter "Soft Modern" direction.

## Approach

Extend the existing hand-written `theme.css` design system rather than
adopting a CSS framework (e.g. Tailwind). The app is a dozen pages sharing
one theme file with no prior framework, and its whole pitch is running free
with minimal moving parts — adding a framework would mean new build tooling
and touching every page's markup for a styling-only goal. Extending the
current system reaches the same visual result with no new dependencies.

## 1. Visual system (tokens)

Add to `:root` in `web/src/styles/theme.css`, built on the existing
navy/red/gold palette — additive, not a replacement:

- `--brand-navy-2` (a lighter navy, e.g. `#1c1c56`) — header gradient
- `--shadow-sm`, `--shadow-md` — elevation shadows for cards/buttons
- `--status-pass`, `--status-fail`, `--status-progress` — semantic aliases
  for `--success` / `--brand-red` / `--brand-gold`, so components reference
  status by meaning
- A slightly heavier heading type scale (replacing the ad hoc inline
  `style={{ fontWeight, fontSize }}` used today for headings in several
  pages)

Spacing unit, border-radius, and base font stay as-is.

## 2. Component patterns

- **TopBar** (`web/src/components/TopBar.jsx`): navy → navy-2 gradient
  background (currently flat navy), 3px gold bottom border. Same sticky /
  safe-area-inset behavior as today.
- **Cards** (`.card` in `theme.css`): base card gets `--shadow-sm` instead of
  a flat border-only look. New modifier classes `.card--pass`,
  `.card--fail`, `.card--progress` add a 4px colored left bar using the
  status tokens. Existing plain `.card` usage (e.g. admin list rows) is
  unaffected unless a status modifier is applied.
- **Buttons** (`button.primary` and variants): colored drop-shadow matching
  variant (navy default, red glow for `.danger`, etc.) for a heavier,
  tactile CTA feel. Same sizes/padding as today.
- **Badges** (`.badge`): uppercase + letter-spacing, replacing the current
  soft-pill look, to match the bolder label style.
- **List rows** (`.list-row`): unaffected structurally — inherits the card
  treatment above where a row is already `.card.list-row`.

All changes live in `theme.css` plus class-name additions in JSX — no
logic changes. `TopBar.jsx` needs a direct edit; most pages inherit the rest
for free via shared classes.

## 3. Rollout scope and order

A grep of the codebase found 266 inline `style={{...}}` occurrences across
23 files (heaviest: `LiveTestRunnerPage.jsx` 57, `AdminsPage.jsx` 27,
`ResultsPage.jsx` / `TemplateEditorPage.jsx` ~20 each). Reaching the whole
app means reconciling these against the new shared classes, not just
editing `theme.css`. Full app is in scope; work is sequenced by visual
impact:

1. **Foundation** — token + component layer in `theme.css`, `TopBar.jsx`
   (affects every screen immediately).
2. **Field-facing screens** — `LoginPage`, `HomePage`, `RecruitConfirmPage`,
   `LiveTestRunnerPage` (+ `ObstacleCourseRunner`, `ObstacleCourseSummary`,
   `CourseDiagram`, `CourseMap`), `ResultsPage`. Highest impact — what
   evaluators/recruits see live — and where most inline-style cleanup is
   needed.
3. **Admin/management screens** — `AdminsPage`, `RecruitsAdminPage`,
   `TemplatesAdminPage`, `TemplateEditorPage`, `SetupAdminPage`. Inherit the
   foundation for free; bespoke table/form styling reconciled to match.
4. **Reporting screens** — `pages/reporting/*` (Cohort Dashboard, Recruit
   History list/detail, Session Detail, Template Aggregate). Lowest
   visual-impact tier (internal/desk use), done last.

## 4. Verification

No visual regression tooling exists or is warranted at this project's size.
Verification is manual: run `npm run dev` and walk every screen at mobile
viewport width (the app's primary target) after each phase, in the order
above. Confirm nothing functionally regresses (buttons still clickable,
forms still submit) since this is a pure styling pass with no logic
changes. Dark mode is out of scope — the app has none today.

## Out of scope

- Any UX/flow changes (navigation structure, form fields, business logic)
- Dark mode
- Adopting a CSS framework or component library
- Reporting/admin data changes of any kind
