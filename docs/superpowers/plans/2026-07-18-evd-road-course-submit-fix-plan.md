# EVD Road Course Submit Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Live Test Runner so a template that includes an Overall Timer line anywhere other than last (the natural shape for an "EVD Road Course" — the whole-drive stopwatch running first, ahead of the graded/critical steps and the obstacle course) can actually be advanced through and submitted, instead of getting permanently stuck on the Overall Timer's own card.

**Architecture:** Root-caused via live reproduction against the emulator harness (built the exact template shape, confirmed Next stays disabled, confirmed a control template without an Overall Timer line submits fine). `LiveTestRunnerPage.jsx`'s `canAdvance()` treats `LINE_TYPES.INSTRUCTION` as always-advanceable (nothing to grade inline) but not `LINE_TYPES.OVERALL_TIMER`, even though the Overall Timer's `LineCard` branch is equally non-interactive — it has no Pass/Fail or Start/Stop control of its own; it's only ever graded by the sticky "Stop Test" banner button, which is rendered independently of `currentIndex` and stays clickable in every view regardless of which line is current. So when the Overall Timer becomes `current` and isn't the last line, `canAdvance()` falls through to `return !!current.result`, which is permanently `false` — the evaluator has no way to move past it except "Stop Test," which force-ends the *entire* session immediately (grading every other ungraded line as an instant fail), not just this one line. The fix is one line: let `canAdvance()` treat `OVERALL_TIMER` the same as `INSTRUCTION`. The existing `isLastLine && overallTimerLine && overallTimerLine.result == null` guard directly above it (which correctly blocks *finishing the test* while the Overall Timer sits ungraded) is untouched and keeps doing its job.

**Tech Stack:** React 18 (function components + hooks), Firebase JS SDK v10 (Firestore), Vite. No unit-test framework is installed in `web/`. Verification is a live reproduction/regression check via the repo's `GFD-Training-Practicals/web:verify` skill (Firestore/Auth emulators + Playwright) — this bug is a UI navigation dead-end that can only be meaningfully verified by actually clicking through the Live Test Runner.

## Global Constraints

- This is a one-line logic fix inside `canAdvance()` (`web/src/pages/LiveTestRunnerPage.jsx:266-279`). Do not touch `confirmStopTest()`, `advance()`, or the `isLastLine && overallTimerLine...` guard — they are correct and already covered by the plan's regression checks.
- The fix must not weaken the existing last-line guard: a template must still be blocked from *finishing* while its Overall Timer line is ungraded. Only *moving past* an ungraded, non-last Overall Timer line should become possible.
- This bug is not exclusive to failing runs — it blocks any run (pass or fail) whose template puts the Overall Timer line before the last position. Fix it generally; do not special-case on `RESULT.FAIL`.

---

## File Structure

- `web/src/pages/LiveTestRunnerPage.jsx` **(modify)** — one-line change inside `canAdvance()` (line 274).

---

### Task 1: Let `canAdvance()` treat a non-last Overall Timer line as always-advanceable

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx:266-279`

**Interfaces:**
- Consumes: existing `current`, `isLastLine`, `overallTimerLine`, `LINE_TYPES.INSTRUCTION`, `LINE_TYPES.OVERALL_TIMER` already in scope in this function — no new imports.
- Produces: `canAdvance(): boolean` — same signature and call sites (`LiveTestRunnerPage.jsx:746`, the Standard view's Next/Submit button), just no longer permanently `false` when a non-last-line Overall Timer is current.

- [ ] **Step 1: Reproduce the bug live, before making any change**

Use the `GFD-Training-Practicals/web:verify` skill to start the emulator harness (Firestore/Auth emulators + `VITE_USE_EMULATOR=1 npm run dev`) and seed the admin login.

In Manage Tests, build a template shaped like a real EVD Road Course — Overall Timer first, then at least one other step:
1. **Overall Timer** — pass at ≤ 300s (any value)
2. **Instruction** — "Begin the road course when ready."
3. **Graded Step**, marked **Critical failure** — "Maintains lane control" — 10 pts

Start a live test on that template. On the very first card ("Overall Timer... scored automatically by the banner above"), confirm the **Next** button (`.screen ~ button:has-text("Next")` / the sticky footer button) is disabled and stays disabled — there is no way to reach step 2. This is the bug.

- [ ] **Step 2: Apply the fix**

In `web/src/pages/LiveTestRunnerPage.jsx`, in `canAdvance()`:

```javascript
// before, lines 266-279:
  function canAdvance() {
    if (!current) return false;
    // The Overall Timer line is only ever scored by Stop Test (see its dedicated read-only
    // LineCard branch), never by completing whichever line happens to be last. Without this
    // check, a template shaped like [Overall Timer, ...graded steps..., closing Instruction]
    // could be finished via Submit on that closing line while the Overall Timer line itself
    // sits ungraded — silently dropping its result/elapsed time/pause history from the report.
    if (isLastLine && overallTimerLine && overallTimerLine.result == null) return false;
    if (current.lineTypeSnapshot === LINE_TYPES.INSTRUCTION) return true;
    // A result must be recorded first. The note-required-on-failure rule is enforced with a
    // blocking pop-up in advance() (like the distance gate), rather than by silently
    // disabling this button — so the evaluator gets a clear prompt instead of a dead button.
    return !!current.result;
  }

// after:
  function canAdvance() {
    if (!current) return false;
    // The Overall Timer line is only ever scored by Stop Test (see its dedicated read-only
    // LineCard branch), never by completing whichever line happens to be last. Without this
    // check, a template shaped like [Overall Timer, ...graded steps..., closing Instruction]
    // could be finished via Submit on that closing line while the Overall Timer line itself
    // sits ungraded — silently dropping its result/elapsed time/pause history from the report.
    if (isLastLine && overallTimerLine && overallTimerLine.result == null) return false;
    // Instruction and Overall Timer cards both have nothing to grade inline (Overall Timer is
    // only ever graded by the sticky Stop Test banner, which works independently of
    // currentIndex in every view) — so neither should block moving to the next line. The
    // guard immediately above already blocks finishing the test while the Overall Timer is
    // ungraded; it's scoped to isLastLine, so it doesn't interfere here — this branch only
    // unblocks stepping past the timer mid-template, never finishing while it's ungraded.
    if (current.lineTypeSnapshot === LINE_TYPES.INSTRUCTION || current.lineTypeSnapshot === LINE_TYPES.OVERALL_TIMER) {
      return true;
    }
    // A result must be recorded first. The note-required-on-failure rule is enforced with a
    // blocking pop-up in advance() (like the distance gate), rather than by silently
    // disabling this button — so the evaluator gets a clear prompt instead of a dead button.
    return !!current.result;
  }
```

- [ ] **Step 3: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 4: Verify the fix on the same template from Step 1**

Reload the in-progress session (or start a fresh one on the same template). On the Overall Timer card, confirm **Next** is now enabled and advances to the Instruction step, then to the Graded Step.

- [ ] **Step 5: Full end-to-end regression — drive a FAILED run through this template to Submit**

Continuing that live test:
1. On the Graded Step ("Maintains lane control"), tap **Fail**. Confirm the "Note Required" pop-up blocks **Next** until a note is entered (existing behavior, unchanged).
2. Add a note, continue. This is now the last line — confirm the button reads **Submit** and is enabled.
3. Tap **Submit**. Confirm the session finishes: Results screen shows overall result **FAIL** and **CRITICAL FAILURE**.
4. Return to the sticky **Stop Test** banner control from a *fresh* second run on the same template: start a new session, confirm the Overall Timer's Pause/Resume/Stop Test controls in the banner still work and still correctly grade the Overall Timer line and end the session early, exactly as before this change (this exercises `confirmStopTest()`, which this plan does not modify — confirm no regression).
5. Build one more template with the Overall Timer as the **last** line (its original supported shape: `[Instruction, Graded Step, Overall Timer]`) and confirm Submit is still correctly blocked until Stop Test is pressed on that line, then completes normally once it is — this is the existing `isLastLine && overallTimerLine...` guard; confirm it still works unmodified.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx
git commit -m "fix: let a non-last Overall Timer line be advanced past in the live test runner"
```
