# Batch Grade Feature — Design

## Goal

Admin-only flow for grading many recruits against one single skill in one
sitting (e.g. watching 20 recruits do hose rolls back-to-back), instead of
the normal one-recruit-then-one-test flow. Confirmed shape:

- Picking a skill leads to a **roster grid**: every active recruit listed
  with a quick Pass/Fail control. Marking Fail opens a note-required
  popup (mirrors the existing pattern in `LiveTestRunnerPage`'s
  `showNoteRequired`), the same way any other failed graded step is
  handled elsewhere in the app.
- Batch-grade "tests" are **lightweight**: a name plus a single graded
  pass/fail line — no multi-step template, no timer, not built through
  `TemplateEditorPage`, never shown in Manage Tests.

## Data model

Reuse the existing `templates` + `sessions` pipeline rather than inventing
a parallel one — this is what makes #4e ("appear alongside other tests on
Reports") free, since every reporting page already queries `templates`
where `isActive == true` with no other filter
(`TemplateReportListPage.jsx:12`, `reportsData.js:31`) and will pick these
up automatically.

- `templates/{id}`: `{ name, isActive: true, isBatchGrade: true, createdAt,
  passingPercentage: 100 }`. No `status` field (draft/published doesn't
  apply — these are never edited through the template editor).
- `templates/{id}/lines/{lineId}`: exactly one line,
  `{ lineType: "graded", lineText: <same as template name>, points: 1,
  isCritical: false, sortOrder: 0 }`.
- Grading a recruit creates a normal `sessions` doc + one `lineResults` doc,
  built the same way `RecruitConfirmPage`/`goToNextTest` already build them
  (snapshot the line, `pointsSnapshot: 1`, `result: PASS/FAIL`,
  `note`/`photoURLs` on fail), then immediately `status: COMPLETED`. Since
  it's a real completed session with a real `overallResult`, everything
  downstream (pass-rate reports, cohort dashboard, CSV export, and the
  existing failure-notification email in `notify.js`) treats it exactly
  like any other test with zero special-casing — a batch-grade FAIL fires
  the same `sendFailureEmail()` as any other failed test.
- Existing queries that must explicitly exclude these (client-side filter,
  matching the codebase's existing `isPractice` filtering convention —
  `reportsData.js`'s comment on why practice-filtering is client-side
  applies equally here):
  - `HomePage.jsx` (normal recruit test picker) — add
    `.filter(t => !t.isBatchGrade)`
  - `TemplatesAdminPage.jsx` (Manage Tests) — same filter; these are never
    edited/retired from there
  - `TestGroupsAdminPage.jsx`'s template picker (a batch-grade "test" isn't
    a valid group member) — same filter

## Screens

**1. Admin Dashboard button (#4a)** — `AdminDashboardPage.jsx` gets a new
tile/button "Batch Grade" alongside the existing admin grid, navigating to
`/batch-grade`.

**2. `BatchGradePage.jsx`** (route `/batch-grade`, admin-only) — combines
(b)/(c)/(d) into one screen:
- Dropdown of existing batch-grade tests (`where("isBatchGrade","==",true)
  .where("isActive","==",true)`, sorted by name) — seeded once with the 17
  skills from the request (Hose Rolls, Hose Carries, Denver Pack, Loading
  the Minuteman, Operate a Water Can, Operate an ABC Extinguisher, 4x4
  Ventilation Opening on a Prop from a Roof Ladder Chainsaw, 4x4
  Ventilation Opening on a Walkable Pitch Roof with a Chainsaw, Operate
  Rotary Saw with Chopper Blade on a Flat Roof, Stops Flowing Sprinkler
  with Wooden Wedges, Catches Hydrant/Connects to FDC/Pumps Standpipe,
  Performs Interior Engineer Standpipe Functions, Performing Accordion
  Fold and Roll, Constructs a Water Chute, Constructs a Catch-All, Uses a
  Diffuser on a Hydrant, Catches and Dresses a Hydrant, Setting Up a Drop
  Tank Drafting Operation) via a one-time seed script run during
  implementation, not hand-entered through the UI.
- "+ Add New" opens a small modal (name only) that creates a new
  batch-grade template + its single line, then the dropdown refreshes and
  selects it.
- "Start Grading" button (enabled once a test is selected) navigates to
  `/batch-grade/:templateId`.

**3. `BatchGradeRosterPage.jsx`** (route `/batch-grade/:templateId`,
admin-only) — the roster grid:
- Lists active recruits (same exclusion as `RecruitsAdminPage`: no practice
  recruit), each row: photo/initials, name, cohort, and Pass/Fail buttons.
- Pass → immediately creates the completed session (no popup).
- Fail → opens the note-required popup (note text required, photo
  optional via the existing `compressImageToDataUrl` path), then creates
  the completed session with that note/photo on the single line.
- Once graded, a row shows its result badge (PASS/FAIL) instead of the
  buttons, so the admin can see roster progress at a glance while working
  down the list. Re-grading a recruit (e.g. retake) is just grading them
  again — a second `sessions` doc, same as a normal retake elsewhere in the
  app.

## Files touched / added

- `web/src/pages/AdminDashboardPage.jsx` (new button)
- `web/src/pages/BatchGradePage.jsx` (new)
- `web/src/pages/BatchGradeRosterPage.jsx` (new)
- `web/src/pages/HomePage.jsx`, `TemplatesAdminPage.jsx`,
  `TestGroupsAdminPage.jsx` (exclude `isBatchGrade` templates)
- `web/src/App.jsx` (two new admin-only routes)
- One-time seed script/data for the 17 initial batch-grade templates
- `firestore.rules`: no change needed — `templates`/`sessions` write rules
  already require `isAdminRole()`/`isStaff()` respectively, which already
  covers this flow correctly (batch grading is admin-only in the UI, and
  admins already satisfy both rules).
