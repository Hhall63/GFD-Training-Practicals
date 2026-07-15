# Recruit Transcript Reports — Design

Second of three specs (written exam gradebook → **recruit transcripts** → class report
builder). Builds on subsystem A's `resolveEffectiveSession` helper and the exam gradebook's
data.

## Goal

Two printable, letter-size reports per recruit: a one-page **Summary Transcript** (a curated
"core" set of tests/exams) and a **Complete Transcript** (the same core section, plus every
other test/exam the recruit has actually completed).

## Data model

- New field on template docs (both regular `templates` and the exam templates from subsystem
  A): `includeInSummaryTranscript: boolean` (default unset/false). Exposed as a checkbox in
  `TemplateEditorPage.jsx` and in `ExamsAdminPage.jsx`'s new/edit modal.
- New shared builder, `buildTranscriptLineItems({ recruitId })` in `reportsData.js`:
  - Loads the recruit's completed, non-practice sessions, groups by `templateId`
  - Reduces each group through `resolveEffectiveSession` (from the gradebook spec) to identify
    the original attempt and, if present, the retake
  - Returns `{ core: LineItem[], remaining: LineItem[] }`, split by each template's
    `includeInSummaryTranscript` flag — `remaining` only includes templates the recruit has
    actually completed (never-attempted tests are omitted, per your answer)
  - `LineItem` shape: `{ templateName, original: { result, dateMs, evaluatorName }, retake:
    { result, dateMs, evaluatorName } | null }`
  - This is the one place "what counts as this recruit's result for a test" is computed for
    reporting — subsystem C's class report calls the same function per recruit, so there is a
    single implementation of the line-item/retake-sub-line shape.

## Screens

Triggered from `RecruitHistoryDetailPage.jsx` — two new buttons, **Print Summary Transcript**
and **Print Complete Transcript**, each opening a dedicated print-only route (no `TopBar`/nav
chrome):

- `TranscriptSummaryPage.jsx` — `/reports/recruits/:recruitId/transcript/summary`
- `TranscriptCompletePage.jsx` — `/reports/recruits/:recruitId/transcript/complete` — renders
  the identical header + core section as Summary, then a second heading ("Additional Tests &
  Practicals") followed by the `remaining` line items

**Shared layout**, `TranscriptHeader.jsx` (reused by both pages and, later, the class report):
- Header row: `assets/gfd-badge.png` (left) and `assets/work-hard-be-humble.jpg` (right)
  flanking centered text "Greensboro Fire Department Training Division"
- Recruit block: `photoURL` (or initials fallback, matching the rest of the app) enlarged for
  print (~1.5in square), top-left; name / `recruitClassOrCohort` / badge# beside it
- One row per line item: test name — PASS/FAIL badge — date — evaluator name. When `retake`
  is present, a compact sub-line appears beneath: "Retake: `date` — `PASS/FAIL` — by
  `evaluator`". No sub-line at all when there's no retake (not a blank placeholder row).

**Print mechanism:** `@media print` CSS, `@page { size: letter; margin: 0.5in; }`; a visible,
non-printing "Print / Save as PDF" button calls `window.print()`. Designed to fit one page for
a typical core-item count but allowed to overflow to a second page rather than truncating.

## Edge cases

- Recruit has no `core`-flagged completions yet: header/photo still render; core section shows
  "No core tests recorded yet" instead of an empty gap.
- Recruit has zero completed sessions at all: both pages show header + that same empty-state
  message, no `remaining` heading on Complete.
- No `photoURL`: falls back to the initials avatar, same as every other recruit-photo spot in
  the app.

## Files touched / added

- `web/src/pages/reporting/TranscriptSummaryPage.jsx` (new)
- `web/src/pages/reporting/TranscriptCompletePage.jsx` (new)
- `web/src/components/TranscriptHeader.jsx` (new)
- `web/src/lib/reportsData.js` — add `buildTranscriptLineItems`
- `web/src/pages/TemplateEditorPage.jsx` — add `includeInSummaryTranscript` checkbox
- `web/src/pages/ExamsAdminPage.jsx` (from subsystem A) — same checkbox
- `web/src/pages/reporting/RecruitHistoryDetailPage.jsx` — two new print buttons
- `web/src/App.jsx` — two new admin-only routes
- `web/src/styles/theme.css` (or a new `print.css`) — `@media print` rules
- `firestore.rules` — no change; these pages only read `templates`/`sessions`/`recruits`,
  already admin-readable

## Testing

- Unit: `buildTranscriptLineItems` — recruit with only core items, only remaining items, a
  retake present/absent, zero completed sessions, a template missing the new flag entirely
  (treated as not-core, matching the "unset = false" default).
- Manual (`web:verify`): print-preview both pages for a recruit with a mix of core/remaining
  tests and one retake; confirm header images and photo render correctly; confirm a recruit
  with no photo falls back cleanly; confirm the empty-state messages for a freshly-added
  recruit with no completed tests.
