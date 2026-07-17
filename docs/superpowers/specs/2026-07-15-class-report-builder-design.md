# Class Report Builder — Design

Third of three specs (written exam gradebook → recruit transcripts → **class report
builder**). Builds on subsystem A's `resolveEffectiveSession` and subsystem B's
`buildTranscriptLineItems`/`TranscriptHeader`.

## Goal

Let an admin build and save a named, reusable report query: pick a cohort and a multi-select
of specific tests/exams, then print a per-recruit breakdown of just those results — with the
query itself saved ("pinned") so it can be regenerated later against current data rather than
rebuilt from scratch each time.

## Data model

New collection, `classReportFilters/{id}` — a saved query configuration, not a frozen
snapshot:
```
{
  name: string,             // admin's label, e.g. "Recruit Class 47 — Finals"
  cohort: string,            // matches recruits' recruitClassOrCohort
  templateIds: string[],     // selected tests/exams, display order
  createdAt: Date,
  isActive: true,
}
```
Reopening a saved filter re-runs it against current data, so a recruit's newer retake (or a
test added to `templateIds` after the fact) shows up correctly.

Report generation reuses `buildTranscriptLineItems(recruitId)` from the transcript spec,
filtered to just `templateIds` instead of the core/remaining split — one implementation of
"what's this recruit's result for this test," shared by both features.

## Screens

**`ClassReportsListPage.jsx`** (route `/reports/class`, admin-only, linked from
`ReportingHomePage.jsx`'s quick links):
- Lists saved `classReportFilters` (name, cohort, test count) — each row opens its generated
  report at `/reports/class/:filterId`
- **Delete** action per row (`isActive: false`, soft delete — same convention as Test Groups)
- **"+ New Class Report"** opens a popup form (shared `Modal`):
  - **Name** (required)
  - **Cohort** dropdown — distinct `recruitClassOrCohort` values among active recruits
  - **Tests/Exams** multi-select checklist of active templates (practicals + written exams
    together), exams grouped by `examCategory`, practicals listed separately underneath
  - **Save** writes the `classReportFilters` doc, then navigates straight to the generated
    report

**`ClassReportPage.jsx`** (route `/reports/class/:filterId`, admin-only, print-only chrome,
no `TopBar`/nav):
- Renders `TranscriptHeader`'s header block once (badge + work-hard-be-humble +
  "Greensboro Fire Department Training Division")
- Per active recruit in the filter's cohort: recruit name, then their line items restricted
  to `templateIds` — same name / PASS-FAIL / date / evaluator / retake-sub-line format as the
  transcripts, no photo (matching the spec's name-only wording for this report)
- `@media print { break-before: page }` on each recruit's section, so print/Save-as-PDF
  separates recruits onto their own pages
- Same "Print / Save as PDF" button as the transcript pages

## Edge cases

- Cohort has zero active recruits at report-generation time (e.g. everyone since
  deactivated): show a "No active recruits in this cohort" message instead of an empty page.
- A `templateId` saved in the filter references a since-deactivated template: still shown
  (historical results must remain visible), labeled the same fallback way
  `TestGroupsAdminPage.jsx` already handles a missing template ("(test no longer available)").
- Save is disabled until name is non-empty, a cohort is chosen, and at least one test/exam is
  selected.

## Files touched / added

- `web/src/pages/reporting/ClassReportsListPage.jsx` (new)
- `web/src/pages/reporting/ClassReportPage.jsx` (new)
- `web/src/lib/classReports.js` (new) — `createClassReportFilter`, `deactivateClassReportFilter`
- `web/src/lib/reportsData.js` — small addition to filter `buildTranscriptLineItems`'s output
  by an explicit `templateIds` list (reused as-is otherwise)
- `web/src/pages/reporting/ReportingHomePage.jsx` — new quick link
- `web/src/App.jsx` — two new admin-only routes
- `firestore.rules` — new `match /classReportFilters/{id}` block, `allow read, write: if
  isAdminRole()`, matching every other `/reports` collection's admin-only access

## Testing

- Unit: filtering `buildTranscriptLineItems` down to a `templateIds` subset; a cohort with no
  active recruits; a `templateId` pointing at a deactivated template.
- Manual (`web:verify`): create a class report filter naming a real cohort and a handful of
  tests/exams (mixing practicals and written exams), print-preview it, confirm each recruit
  starts a new page, reopen the saved filter later and confirm it reflects a newly-entered
  grade without needing to recreate the filter.
