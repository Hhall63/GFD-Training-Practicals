# Grading Flow Critique Fixes — Design

Three independent fixes to the live grading and batch-grade/test-group admin
flows, raised together as one round of field feedback. Each is scoped small
enough to land as its own task in the implementation plan, but they share no
code, so there's no ordering dependency between them.

## 1. Batch Grade "Add New" picks an official test instead of free-typing one

**Problem:** `AddNewBatchTestModal` (`BatchGradePage.jsx`) is a Name +
Description text form. An admin adding "Forcible Entry" to the Batch Grade
list today has to retype a name/description that likely already exists as a
real, published test built in Manage Tests.

**Fix:** Replace the free-text form with a picker modal, reusing the same
`Modal` + list-tile pattern already used by this same page's "Select a Test"
picker (`BatchGradePage.jsx`'s `pickerOpen` block).

- Query: `templates` where `isActive == true` and `status == "published"`,
  client-filtered to drop `isBatchGrade`/`isWrittenExam` docs — identical to
  the set `TestGroupsAdminPage.jsx` already draws its picker from. Only
  tests an evaluator could already run standalone from Home are offered.
- Each tile shows the test's name and, when present, its description
  (mirrors the existing "Select a Test" tile and `TemplatesAdminPage`'s
  list row).
- Tapping a tile calls the existing `createBatchGradeTemplate(name,
  description)` (`lib/batchGrade.js`) with that test's `name`/`description`
  — same function, same one-line lightweight template written underneath,
  just sourced by selection instead of typing. No new library function
  needed.
- The selected official test itself is never modified — it keeps its own
  `isBatchGrade` (unset), its full lines/steps, and its place in Manage
  Tests, exactly as before. This deliberately does not reuse the official
  template's own `templates/{id}` doc or its `lines` subcollection; Batch
  Grade's one-line-pass/fail architecture (`createBatchGradeTemplateDoc`)
  is unchanged, only its input source changes.
- If there are no published official tests yet, the modal shows the same
  "No tests available yet" empty state style as the existing pickers.

**Files touched:** `web/src/pages/BatchGradePage.jsx` only. No changes to
`web/src/lib/batchGrade.js` — `createBatchGradeTemplate` is reused as-is.

## 2. One overall failure note, not one per failed step

**Problem:** In `LiveTestRunnerPage.jsx`, both `advance()` (Standard view)
and `submitAll()` (Checklist/Tile views) block on **every individual failed
step** with a blocking "Note Required" popup, on top of the separate
overall-test-fails-passing-score gate that already exists on the last line.
On a multi-step template like the EVD Road Course, a recruit who fails
several graded steps forces the evaluator through a separate note popup for
each one.

**Fix:**

- In `advance()`: delete the `stepFailed` block (the one gated on
  `current.result === RESULT.FAIL && !hasFailNote()`). Keep the existing
  `overallFail` block (gated on `isLastLine` and the computed
  `overallResult === RESULT.FAIL`) untouched — that's the one remaining
  required note.
- In `submitAll()`: delete the `failMissingNote` scan across all lines (the
  `stepFailed` case). Keep the existing overall-fail check against the last
  line untouched.
- `hasFailNote()`, `noteRequiredReason`, and the "Note Required" modal
  itself are unchanged — `noteRequiredReason` will now only ever be set to
  `"overallFail"`, so the modal's `stepFailed` copy branch becomes dead code
  and is removed along with it.
- `LineCard`'s per-step `AttachmentCapture` (Timer and Graded-line branches)
  changes its `isRequired` prop from `current.result === RESULT.FAIL` to a
  flat `false` — matching the Obstacle Course branch, which already passes
  `isRequired={false}` unconditionally today. This flips the box's copy/
  styling from the red "⚠️ Photo or note required for a Fail result" to the
  neutral "📎 Add photo or note (optional)" on every line type, consistent
  with nothing being enforced there anymore. The box itself (photo capture +
  note textarea) is otherwise unchanged.

**Also — optional photo on every remaining failure/note field:** two
blocking, text-only note modals remain after the above (both intentionally
required, per the design above / the existing Aggressive Driving feature)
and both gain an optional photo-attach control, using the same
`compressImageToDataUrl` + array-append pattern `AttachmentCapture` and
`BatchGradeRosterPage`'s `FailNoteModal` already use:

- The "Note Required" (`overallFail`) modal in `LiveTestRunnerPage.jsx` —
  adds a "📷 Take Photo" control next to the textarea; confirming appends to
  the target line's `photoURLs` via the same `patchLine` call that already
  saves the note.
- The "Aggressive Driving — Critical Failure" confirm modal in
  `ObstacleCourseRunner.jsx` — same optional photo control, appended to
  `current.photoURLs` via `patchCurrent` alongside the existing note.

Neither photo control is required to confirm/submit in either modal — both
buttons stay gated only on the note textarea, exactly as today.

**Files touched:** `web/src/pages/LiveTestRunnerPage.jsx`,
`web/src/components/ObstacleCourseRunner.jsx`.

## 3. Test description shown under test name when building a Test Group

**Problem:** `NewTestGroupModal`'s checklist (`TestGroupsAdminPage.jsx`)
lists only `template.name` per row, so two similarly-named tests (e.g. two
different door types under "Forcible Entry") are indistinguishable while
picking tests for a group.

**Fix:** In that checklist's row (the `templates.map(...)` block rendering
each `<label>` with a checkbox), show `template.description` under the name
when present, in the same muted/secondary style already used for this
purpose on `BatchGradePage`'s test picker and `TemplatesAdminPage`'s list
row. The "Run Order" list below it is unchanged (name only) — the
description only needs to appear on the selection checklist itself, where
disambiguation matters.

**Files touched:** `web/src/pages/TestGroupsAdminPage.jsx` only.

## Testing

No unit-test framework is installed in `web/` (consistent with every other
recent plan in this repo). Verification is a live click-through against the
emulator-backed harness (`GFD-Training-Practicals/web:verify` skill) plus
`npm run build`:

1. Batch Grade → Add New → confirm the modal lists published official tests
   (not batch-grade/written-exam ones), picking one creates and selects a
   new batch-grade template with that name/description, and the original
   official test is untouched in Manage Tests.
2. Build (or reuse) a multi-step template with 2+ graded/critical steps.
   Run it live, fail two different steps without touching their photo/note
   boxes, and confirm Next/Submit is never blocked until the last line —
   where, if the computed overall result is FAIL, the one overall "Note
   Required" popup appears (with its new optional photo control) exactly
   once.
3. On a failed step, confirm the attachment box now reads "Add photo or
   note (optional)" instead of the red "required" copy, and that adding a
   photo there still works.
4. Obstacle Course: trigger "Aggressive Driving — Critical Failure", confirm
   the modal's new optional photo control attaches to the step without
   being required to confirm.
5. Test Groups → New Test Group: confirm each test's description renders
   under its name in the selection checklist.
