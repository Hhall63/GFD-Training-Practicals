# Practicals Grading Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the one path where a failing test can finish without a required note (the "⏹ Stop Test" early-stop button), and make Checklist the default display view for every practical except the obstacle-course one.

**Architecture:** Two independent, small edits in the Live Test Runner flow — no new components, no data model changes. Task 1 adds a note-required gate to `confirmStopTest()`, mirroring the gate `advance()`/`submitAll()` already have. Task 2 changes two `viewMode` default values (in `RecruitConfirmPage.jsx`, where the Display View picker actually lives, and `LiveTestRunnerPage.jsx`'s own fallback for direct-load/refresh cases) — both already funnel through existing obstacle-course-detection logic that forces Standard, unchanged.

**Tech Stack:** React (existing components/hooks), `firebase/firestore` (existing, unchanged calls), no new dependencies.

## Global Constraints

- The note-required gate added to `confirmStopTest()` fires only when the computed overall result is `RESULT.FAIL` and `!hasOverallNote()` — identical condition shape to the existing gates in `advance()` and `submitAll()`. It runs AFTER `confirmStopTest()`'s existing finalize-writes (the Overall Timer's own result patch and the auto-FAIL of any still-ungraded lines), so `computeSessionOutcome()` sees the test's real final state, not a stale snapshot.
- Do NOT modify `advance()` or `submitAll()` — both already enforce the note requirement correctly and universally (no practical-type exception), per the approved design.
- Do NOT modify the "Note Required" modal's JSX/copy — it already calls whatever `noteContinuationRef.current` holds via `await (noteContinuationRef.current ?? proceed)()`, so pointing it at `finishSessionAndContinue` needs no modal changes.
- View-mode default change: `"standard"` → `"checklist"` in exactly two places — `RecruitConfirmPage.jsx`'s `viewMode` state initializer, and `LiveTestRunnerPage.jsx`'s `viewMode` state initializer's `location.state?.initialViewMode ??` fallback. Do NOT touch either file's existing obstacle-course-detection logic that force-overrides to `"standard"` — both are already correct and unchanged.
- No unit-test framework exists in `web/` — verification is via grep + `npm run build` per task, plus a live end-to-end browser pass in the final task (this repo's established convention).

---

### Task 1: Note required before finishing via Stop Test

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx` (the `confirmStopTest` function, currently lines 456–488)

**Interfaces:**
- Consumes: `computeSessionOutcome`, `hasOverallNote`, `finishSessionAndContinue`, `noteContinuationRef`, `setNoteDraft`, `setNoteDraftPhotos`, `setShowNoteRequired` — all already defined earlier in the same file (used identically by `advance()`/`submitAll()`), no new functions needed.
- Produces: nothing new for other files — this is a self-contained fix inside one existing function.

- [ ] **Step 1: Confirm the current gap**

```bash
cd web && grep -n "async function confirmStopTest" -A 35 src/pages/LiveTestRunnerPage.jsx | tail -10
```

Expected output ends with:

```
    setShowStopConfirm(false);
    await finishSessionAndContinue();
  }
```

— confirming `confirmStopTest()` currently calls `finishSessionAndContinue()` directly with no note-required check in between.

- [ ] **Step 2: Modify `web/src/pages/LiveTestRunnerPage.jsx`**

Replace the whole `confirmStopTest` function (currently lines 456–488):

```js
  async function confirmStopTest() {
    const finalElapsed = overallElapsed;
    const result =
      overallTimerLine.passThresholdSecondsSnapshot != null
        ? computeTimerResult(finalElapsed, overallTimerLine.passThresholdSecondsSnapshot)
        : RESULT.PASS;
    const pointsEarned = result === RESULT.PASS ? (overallTimerLine.pointsSnapshot ?? 0) : 0;
    const totalPausedSeconds = overallPauseEvents.reduce(
      (sum, p) => sum + ((p.resumedAtElapsedSeconds ?? finalElapsed) - p.pausedAtElapsedSeconds),
      0
    );

    // Use the same name-addressed patchLine() helper the rest of the page writes through
    // (Task 8), not a hand-rolled updateDoc, so both the Firestore write and the local
    // lineResults/lineResultsRef state stay in sync the same way every other grade does.
    await patchLine(overallTimerLine.id, {
      result,
      pointsEarned,
      elapsedSeconds: finalElapsed,
      pauseEvents: overallPauseEvents,
      totalPausedSeconds,
    });

    const stillUngraded = (lineResultsRef.current ?? lineResults).filter(
      (l) => l.id !== overallTimerLine.id && l.result == null
    );
    await Promise.all(
      stillUngraded.map((l) => patchLine(l.id, { result: RESULT.FAIL, pointsEarned: 0 }))
    );

    setShowStopConfirm(false);
    await finishSessionAndContinue();
  }
```

with:

```js
  async function confirmStopTest() {
    const finalElapsed = overallElapsed;
    const result =
      overallTimerLine.passThresholdSecondsSnapshot != null
        ? computeTimerResult(finalElapsed, overallTimerLine.passThresholdSecondsSnapshot)
        : RESULT.PASS;
    const pointsEarned = result === RESULT.PASS ? (overallTimerLine.pointsSnapshot ?? 0) : 0;
    const totalPausedSeconds = overallPauseEvents.reduce(
      (sum, p) => sum + ((p.resumedAtElapsedSeconds ?? finalElapsed) - p.pausedAtElapsedSeconds),
      0
    );

    // Use the same name-addressed patchLine() helper the rest of the page writes through
    // (Task 8), not a hand-rolled updateDoc, so both the Firestore write and the local
    // lineResults/lineResultsRef state stay in sync the same way every other grade does.
    await patchLine(overallTimerLine.id, {
      result,
      pointsEarned,
      elapsedSeconds: finalElapsed,
      pauseEvents: overallPauseEvents,
      totalPausedSeconds,
    });

    const stillUngraded = (lineResultsRef.current ?? lineResults).filter(
      (l) => l.id !== overallTimerLine.id && l.result == null
    );
    await Promise.all(
      stillUngraded.map((l) => patchLine(l.id, { result: RESULT.FAIL, pointsEarned: 0 }))
    );

    setShowStopConfirm(false);

    // Same test-level note-required gate advance() and submitAll() already enforce — a
    // failing test may never finish without a note, regardless of which of the three paths
    // ends it. Computed AFTER the writes above so this reflects the test's real final state
    // (the Overall Timer's own result and the just-applied auto-FAILs), not a stale snapshot.
    const { overallResult } = computeSessionOutcome(lineResultsRef.current ?? lineResults);
    if (overallResult === RESULT.FAIL && !hasOverallNote()) {
      noteContinuationRef.current = finishSessionAndContinue;
      setNoteDraft(testNoteRef.current?.note ?? "");
      setNoteDraftPhotos(testNoteRef.current?.photoURLs ?? []);
      setShowNoteRequired(true);
      return;
    }

    await finishSessionAndContinue();
  }
```

- [ ] **Step 3: Confirm the gate is in place and the other two paths are untouched**

```bash
cd web && grep -n "noteContinuationRef.current = finishSessionAndContinue" src/pages/LiveTestRunnerPage.jsx; grep -c "noteContinuationRef.current = proceed\|noteContinuationRef.current = submitAll" src/pages/LiveTestRunnerPage.jsx
```

Expected: first command finds one match (the new line in `confirmStopTest`); second command prints `2` (one in `advance()` setting `proceed`, one in `submitAll()` setting itself — both unchanged from before this task).

- [ ] **Step 4: Build clean**

```bash
cd web && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx && git commit -m "$(cat <<'EOF'
fix: require a note before finishing a failed test via Stop Test

confirmStopTest() previously called finishSessionAndContinue()
directly with no note-required check, unlike advance() (Standard
view) and submitAll() (Checklist/Tile), which both already gate on
hasOverallNote() when the computed overall result is a FAIL. This
was the one path where a failing test could finish with no note
ever recorded. The gate runs after the existing finalize-writes so
it sees the test's real final state.
EOF
)"
```

---

### Task 2: Checklist as the default display view

**Files:**
- Modify: `web/src/pages/RecruitConfirmPage.jsx:41`
- Modify: `web/src/pages/LiveTestRunnerPage.jsx:47`

**Interfaces:**
- Consumes: nothing new — both files' existing obstacle-course-detection logic (`RecruitConfirmPage.jsx`'s effect that calls `setViewMode("standard")` when `hasOC` is true; `LiveTestRunnerPage.jsx`'s `effectiveViewMode = hasObstacleCourse ? "standard" : viewMode`) is unchanged and continues to override whichever default this task sets.
- Produces: nothing new for other files — this is the last task before end-to-end verification.

- [ ] **Step 1: Confirm the current defaults**

```bash
cd web && grep -n 'useState("standard")\|useState(location.state?.initialViewMode' src/pages/RecruitConfirmPage.jsx src/pages/LiveTestRunnerPage.jsx
```

Expected: two matches — `RecruitConfirmPage.jsx:41` showing `useState("standard")`, `LiveTestRunnerPage.jsx:47` showing `useState(location.state?.initialViewMode ?? "standard")`.

- [ ] **Step 2: Modify `web/src/pages/RecruitConfirmPage.jsx:41`**

Change:

```js
  const [viewMode, setViewMode] = useState("standard");
```

to:

```js
  const [viewMode, setViewMode] = useState("checklist");
```

- [ ] **Step 3: Modify `web/src/pages/LiveTestRunnerPage.jsx:47`**

Change:

```js
  const [viewMode, setViewMode] = useState(location.state?.initialViewMode ?? "standard");
```

to:

```js
  const [viewMode, setViewMode] = useState(location.state?.initialViewMode ?? "checklist");
```

- [ ] **Step 4: Confirm both defaults changed and the obstacle-course override logic is untouched**

```bash
cd web && grep -n 'useState("checklist")\|useState(location.state?.initialViewMode ?? "checklist")' src/pages/RecruitConfirmPage.jsx src/pages/LiveTestRunnerPage.jsx; grep -n 'if (hasOC) setViewMode("standard")' src/pages/RecruitConfirmPage.jsx; grep -n 'hasObstacleCourse ? "standard" : viewMode' src/pages/LiveTestRunnerPage.jsx
```

Expected: first command finds both new defaults (one per file); second and third each find one match — confirming the existing override logic in both files is still present and unchanged.

- [ ] **Step 5: Build clean**

```bash
cd web && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/RecruitConfirmPage.jsx web/src/pages/LiveTestRunnerPage.jsx && git commit -m "$(cat <<'EOF'
feat: default to Checklist view for every practical except the obstacle course

Changes the Display View picker's default (RecruitConfirmPage.jsx)
and the Live Test Runner's own fallback default for direct-load
cases (LiveTestRunnerPage.jsx) from Standard to Checklist. Both
files' existing obstacle-course detection still force-overrides to
Standard for that one practical type, unchanged. Standard and Tile
remain fully selectable — only the pre-selected default changes.
EOF
)"
```

---

### Task 3: End-to-end browser verification, then push

**Files:** none — verification only, using the app's existing local sandbox harness (per `docs/superpowers/specs/2026-07-28-local-emulator-sandbox-design.md`), same approach as the prior two plans' final tasks.

**Interfaces:** none.

- [ ] **Step 1: Build clean one more time from the full set of changes**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 2: Drive the actual app in a browser and confirm the full design-spec testing checklist**

Use the project's `web:verify` skill (or manually run `npm run dev:sandbox` with seeded data via `npm run seed:sandbox`) to walk through:

1. Start a non-obstacle-course test whose template has a whole-test Overall Timer line → grade enough of the other lines to guarantee an overall FAIL → click "⏹ Stop Test" → confirm → the Note Required modal now appears (this is the fixed gap).
2. From that modal, type a note and click "Save & Continue" → the session finishes normally (Test Group continuation popup if the session belongs to a group, otherwise straight to the results screen — matching the existing behavior of the other two finish paths).
3. Repeat the Stop Test flow on a test that will pass overall → confirm no note prompt appears (the gate only fires on FAIL).
4. Repeat the Stop Test FAIL case, but type a note into the always-visible Test Notes banner *before* clicking Stop Test → confirm no note prompt appears (already-entered note satisfies `hasOverallNote()`).
5. From `RecruitConfirmPage`, start a new non-obstacle-course test without touching the Display View picker → confirm the Live Test Runner opens directly in Checklist view.
6. Start a test on a template containing an Obstacle Course line → confirm the Display View picker is hidden (unchanged) and the runner opens in Standard view (unchanged).
7. On a non-obstacle-course test, manually pick Standard (or Tile) from the Display View picker before starting → confirm the runner opens in that chosen view, not Checklist — confirming only the *default* changed, not the picker's own behavior.
8. Regression check: on Standard view, fail a test and Submit without touching Stop Test → confirm the Note Required modal still appears exactly as before this change (Task 1 didn't touch `advance()`). Same check on Checklist/Tile's Submit (`submitAll()` untouched).

- [ ] **Step 3: Push the branch**

```bash
git push -u origin HEAD
```

Expected: pushes all commits from Tasks 1–2 to a new remote branch (first push on this branch — use `-u` to set upstream, matching this repo's convention of local `worktree-*` branches pushing to an identically-named remote branch).
