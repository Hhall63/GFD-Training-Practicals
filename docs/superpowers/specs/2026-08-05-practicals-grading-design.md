# Practicals Grading Logic — Design

Two small, unrelated-but-cohesive fixes to the Live Test Runner: close a gap
where a failing test can finish without a required note, and change the
default display view for most practicals. Third of four sub-projects split
from a larger request (see
`docs/superpowers/specs/2026-08-05-nav-labeling-polish-design.md`'s
"Related items" for the full list).

## Problem

**Note requirement gap.** A failing test must always get a note recorded
before it finishes — no exception for any practical type. Two of the three
ways a session can finish already enforce this (`advance()` for the
Standard view, `submitAll()` for Checklist/Tile), gated on
`hasOverallNote()` against the one test-level note (the always-visible Test
Notes banner). The third path — `confirmStopTest()`, triggered by the "⏹
Stop Test" button on templates with a whole-test Overall Timer — finalizes
the Overall Timer's result, marks every still-ungraded line as an automatic
FAIL, and calls `finishSessionAndContinue()` directly, with no note check
at all. A test stopped early this way can complete as a FAIL with no note
ever recorded.

**View-mode default.** Every practical starts in the Standard (one-step-
at-a-time) view by default. Checklist (grade every line at once, out of
order) should be the default instead, for every practical except the one
built for a full-screen driving evaluation — the `OBSTACLE_COURSE` line
type, rendered by `ObstacleCourseRunner.jsx` with stopping-distance
tallies, a course map, and an aggressive-driving critical-failure flow.
That one practical is already permanently pinned to Standard (its view
picker is hidden entirely) — this change doesn't touch that, only what the
*other* practicals default to.

## Scope

`web/src/pages/LiveTestRunnerPage.jsx` (the note-requirement fix) and
`web/src/pages/RecruitConfirmPage.jsx` (the view-mode default, plus
`LiveTestRunnerPage.jsx`'s own fallback default for the same reason — see
below). No data model changes, no new components, no changes to the
Standard/Checklist/Tile views' own rendering, grading, or timer logic.

## Change 1: Note required on Stop Test, same as every other finish path

`confirmStopTest()` gets the same gate `advance()` and `submitAll()`
already use, added *after* the existing finalize-writes (the Overall
Timer's own result and the auto-FAIL of any still-ungraded lines) so the
pass/fail computation reflects the test's real final state, not a stale
snapshot from before those writes:

```js
setShowStopConfirm(false);

const { overallResult } = computeSessionOutcome(lineResultsRef.current ?? lineResults);
if (overallResult === RESULT.FAIL && !hasOverallNote()) {
  noteContinuationRef.current = finishSessionAndContinue;
  setNoteDraft(testNoteRef.current?.note ?? "");
  setNoteDraftPhotos(testNoteRef.current?.photoURLs ?? []);
  setShowNoteRequired(true);
  return;
}

await finishSessionAndContinue();
```

No changes to the "Note Required" modal itself — it already calls whatever
`noteContinuationRef.current` holds once a note is saved
(`await (noteContinuationRef.current ?? proceed)()`), so pointing it at
`finishSessionAndContinue` instead of `proceed`/`submitAll` needs no other
code to change. `advance()` and `submitAll()` are otherwise untouched —
they already enforce this universally, with no practical-type exception.

## Change 2: Checklist is the default view (except the obstacle course)

The actual default lives in `RecruitConfirmPage.jsx`'s "Display View"
picker, shown before a test starts — `LiveTestRunnerPage.jsx` only ever
inherits whatever was picked there via router state.

- `RecruitConfirmPage.jsx`: `viewMode` state's initial value changes from
  `"standard"` to `"checklist"`. The existing effect that detects an
  obstacle-course line in the selected template and force-resets
  `viewMode` to `"standard"` (hiding the picker at the same time) is
  unchanged — it already runs on every template selection, so it still
  correctly overrides the new default whenever it applies.
- `LiveTestRunnerPage.jsx`: its own fallback default
  (`location.state?.initialViewMode ?? "standard"`) changes to
  `?? "checklist"`, for the edge case of loading the runner directly with
  no router state (e.g. a page refresh mid-test). Its existing
  `effectiveViewMode = hasObstacleCourse ? "standard" : viewMode`
  computation already force-pins Standard for obstacle-course templates
  regardless of this fallback, so no other change is needed there.

Standard and Tile remain fully available as manual choices on every
practical — only which one is pre-selected changes.

## Non-goals

- No change to how any individual line/step is graded, timed, or displayed.
- No change to the note-required modal's UI, copy, or the single
  test-level note model (still one note for the whole test, not per-line).
- No new "practical type" concept or admin-configurable flag — the
  obstacle-course exception continues to be detected the same way it
  already is everywhere else in this code (does the template contain an
  `OBSTACLE_COURSE` line), not a new marker.
- No change to `advance()` or `submitAll()`'s existing note-required
  logic — both are already correct as written.

## Testing

Manual verification (no unit-test framework in `web/`, consistent with
this repo's other recent plans):

1. Start a non-obstacle-course test with a whole-test Overall Timer line
   (e.g. an evolution timed as a whole) → grade enough lines to guarantee
   an overall FAIL → click "⏹ Stop Test" → confirm → the Note Required
   modal appears (previously it would have finished silently).
2. From that modal, type a note and Save & Continue → the session finishes
   normally (Test Group continuation popup or results screen, matching
   today's behavior for the other two finish paths).
3. Repeat the same Stop Test flow on a test that will pass overall →
   confirm no note prompt appears (unchanged — the gate only fires on
   FAIL, exactly like the other two paths).
4. Repeat the Stop Test FAIL case with a note already typed into the Test
   Notes banner before stopping → confirm no note prompt appears (the
   `hasOverallNote()` check already covers this — verifying the new gate
   doesn't accidentally re-prompt for something already entered).
5. Start a new, non-obstacle-course test from `RecruitConfirmPage` without
   touching the Display View picker → confirm the Live Test Runner opens
   directly in Checklist view.
6. Start a test on a template containing an Obstacle Course line → confirm
   the Display View picker is hidden (unchanged) and the runner opens in
   Standard view (unchanged).
7. On a non-obstacle-course test, manually pick Standard or Tile from the
   Display View picker before starting → confirm the runner opens in that
   chosen view, not Checklist (confirming the default changed, not the
   picker's own behavior).

## Related items

Split from a larger request; the last remaining sub-project (its own
future spec):

- Add-evaluator wizard with scheduled auto-deactivation and a QR-code
  password-setup invite flow.

(The other two sub-projects — nav/labeling polish and confirmation
dialogs — are already shipped as PR #18 and PR #19.)
