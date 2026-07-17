# Written Exam Gradebook — Design

## Goal

Let an admin transcribe paper written-exam scores into the app: define/categorize exams,
grade a whole roster against one exam in a sitting, support a one-shot retest that overrides
the original grade, and correct a mistyped score after saving. This is the first of three
specs (exam gradebook → recruit transcripts → class report builder); the transcript and class
report specs will consume the data this one produces.

## Data model

Reuses the existing `templates` → `sessions` → `lineResults` pipeline rather than inventing a
parallel one, the same way Batch Grade does (see
`docs/superpowers/specs/2026-07-12-batch-grade-feature-design.md`) — this is what makes exams
show up in every existing report, the cohort dashboard, and CSV export with zero extra code,
since those all already query `templates`/`sessions` with no type-specific filter.

**Exam template** (`templates/{id}`):
```
{
  name: string,
  examCategory: string,       // free text, e.g. "Written Exam", "Module 2"
  isWrittenExam: true,
  isActive: true,
  passingPercentage: 70,      // fixed for all exams
  createdAt: Date,
}
```
One child `lines/{lineId}` doc, same shape as Batch Grade's:
`{ lineType: "graded", lineText: <name>, points: 100, isCritical: false, sortOrder: 0 }`.

**Grading a recruit** creates a `sessions` doc + one `lineResults` doc, built the same way
`recordBatchGradeResult` builds one today, except:
- `totalPointsPossible: 100`, `totalPointsEarned: <typed score>`, `overallResult` computed the
  normal way (`totalPointsEarned >= 70` → pass)
- `startedAt`/`completedAt` are the **admin-chosen exam date** (converted to a `Timestamp` at
  noon local time), not `serverTimestamp()`, so transcripts show when the exam actually
  happened rather than when it was typed in
- `attemptType: "first"` for the initial grade, `"retake"` for a retest — identical mechanism
  to practicals (`RecruitConfirmPage.jsx`), including the existing "latest retake overrides
  latest first-attempt" display rule
- `evaluatorName` is the logged-in admin's `displayName` — records who entered the grade
- `criticalFailure: false` always (no critical-step concept for a single-line exam)
- A FAIL still calls the existing `sendFailureEmail()` (same as Batch Grade), so written-exam
  failures notify admins the same way a failed practical does

**Editing a saved score** updates the existing session + lineResult doc in place
(`updateDoc`, recomputing `totalPointsEarned`/`overallResult`) rather than creating a new
session — the first in-place session edit in the app. Editing only ever touches the specific
session the edit control belongs to (the first-attempt session, or the retake session if one
exists) — it never creates a second document.

**Shared retake-resolution helper:** the "latest retake overrides latest first-attempt" rule
currently lives only inside `RecruitHomePage.jsx`'s `statusByTemplate` memo. Extract it into
`reportsData.js` as `resolveEffectiveSession(sessionsForOneTemplate)` (pure function: takes
completed sessions for one recruit+template, returns the effective one by the existing
first/retake + latest-by-`startedAt` rule). `RecruitHomePage.jsx` is refactored to call it;
the new exam grid (below) and the upcoming transcript report both call it too, so there is one
implementation of "which grade counts" instead of three.

**Query exclusions** (mirrors the two spots Batch Grade already had to touch, since exam
templates have no `status` field and would otherwise leak into UIs meant for live-run tests):
- `HomePage.jsx` (evaluator's live-test picker) — add `.filter(t => !t.isWrittenExam)`
  alongside the existing `!t.isBatchGrade`
- `TemplatesAdminPage.jsx` (Manage Tests) — same addition; exams are managed from the new
  Manage Exams page instead
- No change needed in `TestGroupsAdminPage.jsx` or `RecruitHomePage.jsx` — both already query
  `where("status","==","published")`, which exam templates (no `status` field) never match

## Screens

### 1. `ExamsAdminPage.jsx` — "Manage Exams" (route `/exams`, admin-only)

- Lists active exam templates (`isWrittenExam == true && isActive == true`), grouped by
  `examCategory` then sorted by name.
- "+ New Exam" opens a modal (built on the shared `Modal` component — see Dependencies below):
  - **Name** (required text)
  - **Category** (text input with a `<datalist>` of categories already in use, so admins reuse
    existing categories instead of accidentally forking near-duplicates)
  - Creates the template doc + its one line doc in a single batch write (same pattern as
    `seedOneBatchGradeTemplate`'s batched write, to avoid a stranded template with no line)
- Each row has a **Deactivate** action (`isActive: false`) — soft delete only, matching Manage
  Tests / Test Groups, so history for anyone already graded stays intact.
- No rename/edit-category action in this iteration (deactivate + recreate covers the rare
  rename case).

### 2. `ExamScoresPage.jsx` — picker (route `/exam-scores`, admin-only)

- **Exam** dropdown: active exam templates, grouped by category
- **Exam date**: date input, defaults to today
- **Cohort** dropdown: distinct `recruitClassOrCohort` values currently in use among active
  recruits, defaulting to "All"
- "Start Grading" → `/exam-scores/:templateId?date=YYYY-MM-DD&cohort=...`

### 3. `ExamScoresGradingPage.jsx` — grading grid (route `/exam-scores/:templateId`, admin-only)

- On mount, loads the exam template and queries every `sessions` doc for this `templateId`
  (one query, `where("templateId","==",templateId)`) so already-graded state is correct even
  after a reload — unlike `BatchGradeRosterPage`, which only tracks graded state in local
  component state for the current visit and would show a previously-graded recruit as
  ungraded again after a refresh. Sessions are grouped by `recruitId` and reduced through
  `resolveEffectiveSession` plus a lookup for "does a first/retake session already exist" per
  recruit.
- Recruit rows (filtered to the `cohort` query param, or all active recruits if "All"), each
  showing photo/initials, name, and one of:
  - **Not yet graded:** blank numeric input (0–100)
  - **Graded, no retest:** saved score + PASS/FAIL badge, an **Edit** link (reopens the box;
    re-save updates the existing first-attempt session) and an **Enter Retest** link (reveals
    a second, empty 0–100 box)
  - **Graded + retest exists:** both scores shown (original de-emphasized, retest as the
    effective/highlighted one), **Edit** link on the retest box
- One **Save All** button: iterates rows with a new/changed value in their box(es) and
  writes/updates the corresponding session(s) in that single pass; rows left blank are
  skipped (so a partial stack of paper tests can be saved and finished in a later sitting).
  Every session created/updated in this pass uses the exam date chosen on the picker screen.
- Score input validation: integer 0–100; Save All is disabled while any non-blank box holds an
  out-of-range or non-numeric value, with the offending row flagged inline.

### 4. Nav

`getAdminNavItems()` (`lib/navItems.js`) gets two new entries, "Manage Exams" (`/exams`) and
"Enter Exam Scores" (`/exam-scores`), alongside the existing "Manage Tests"/"Batch Grade" pair.

## Error handling

- Save All partially fails (e.g. one write rejected): report which recruit(s) failed to save
  and leave their box populated/unsaved so the admin can retry, rather than silently dropping
  that recruit's grade or rolling back rows that already succeeded.
- Edit/retest updates are single-document writes (session + its one lineResult) — a failure
  surfaces inline on that row without disturbing the rest of the grid.

## Dependencies

- Pulls `Modal.jsx` from the in-progress `audit-p0-p1-remediation` worktree onto `main` as
  part of this work (accessible dialog shell with focus trap — currently only exists on that
  branch, and `TestGroupsAdminPage.jsx` already references it, so it needs to land regardless
  of this feature).

## Files touched / added

- `web/src/pages/ExamsAdminPage.jsx` (new)
- `web/src/pages/ExamScoresPage.jsx` (new)
- `web/src/pages/ExamScoresGradingPage.jsx` (new)
- `web/src/lib/exams.js` (new) — `createExamTemplate`, `recordExamScore`, `updateExamScore`,
  mirroring `lib/batchGrade.js`'s shape
- `web/src/lib/reportsData.js` — add `resolveEffectiveSession`
- `web/src/pages/RecruitHomePage.jsx` — refactor `statusByTemplate` to call the new shared
  helper instead of its inline version
- `web/src/pages/HomePage.jsx`, `TemplatesAdminPage.jsx` — exclude `isWrittenExam` templates
- `web/src/lib/navItems.js` — two new nav entries
- `web/src/App.jsx` — three new admin-only routes
- `web/src/components/Modal.jsx` — brought over from the `audit-p0-p1-remediation` worktree
- `firestore.rules` — no change needed; `templates`/`sessions` writes already require
  `isAdminRole()`, which the UI already restricts this whole flow to

## Testing

- Unit: `resolveEffectiveSession` (first only, first+retake, retake before first
  chronologically, no sessions), pass/fail threshold math at the 70 boundary (69/70/71/100/0).
- Manual (via the `web:verify` skill): create an exam, grade a full roster including one fail
  (confirm notification email fires), edit a saved score, enter a retest that flips fail→pass,
  reload mid-grading to confirm already-graded rows survive the reload, cohort filter narrows
  the roster correctly, deactivate an exam and confirm it disappears from the picker but
  historical sessions still show correctly in Reports.
