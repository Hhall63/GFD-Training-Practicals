# Live Test Runner: Overall-Timer Countdown + Test-Group Bug Fix — Design

## #12 — Test-group bug (root cause found, fix first — #7 depends on it)

**Root cause**: `LiveTestRunnerPage` is mounted on route
`/session/:sessionId/run`. `goToNextTest()` (line 458) navigates to that
same route pattern with a new `sessionId` and `replace: true`. React Router
reuses the same component *instance* for a param change on an already-
matched route — it does not remount. The component's `[sessionId]`-effect
(lines 75-91) only re-sets `sessionData`, `lineResults`, and
`groupTemplateIds`. Every other piece of session-scoped state is left over
from the just-finished test: `currentIndex`, `isTimerRunning`, `elapsed`,
`isOverallRunning`, `overallElapsed`, `overallPauseEvents`,
`showGroupContinue`, `showStopConfirm`, `runningTimerLineIdRef`,
`timerStartRef`, `overallStartRef`/`overallIntervalRef`.

Concretely: `currentIndex` stays at the previous test's last index (often
past the end of the new, possibly-shorter, line list), `isOverallRunning`
stays `true` so the new test's Overall Timer auto-start effect (line 104,
gated on `!isOverallRunning`) never arms, and `showGroupContinue` can still
be `true` from the prior test. This matches the reported symptom exactly:
the next test in the group appears to jump straight to a finished/near-
finished state instead of starting at line 0 — "auto-completed the other
tests without allowing me to run them correctly."

**Fix**: force a full remount on every `sessionId` change instead of
patching a dozen individual state resets (which would be fragile — a new
piece of state added later could reintroduce the same class of bug). Split
the component:

```jsx
export default function LiveTestRunnerPage() {
  const { sessionId } = useParams();
  return <LiveTestRunnerRun key={sessionId} sessionId={sessionId} />;
}

function LiveTestRunnerRun({ sessionId }) {
  // ...all existing logic, unchanged, using the sessionId prop...
}
```

`key={sessionId}` on the inner component makes React tear down and rebuild
the whole subtree — every `useState`/`useRef` re-initializes — whenever the
route moves to a new session, whether that's a Test Group's "Go to Next
Test" or any other in-place session change. Self-contained inside
`LiveTestRunnerPage.jsx`; no `App.jsx` route change needed.

## #7 — 3-2-1 countdown before the Overall Timer starts

Today, `overallTimerLine`'s auto-start effect (line 103-113) arms the
instant the line loads with `result == null` — i.e. immediately on mount,
before the evaluator has necessarily gotten the recruit positioned. Only
templates with an Overall Timer line are affected; templates without one
are unchanged (no countdown, same as today).

- New state `showCountdown` in the (now-remountable, thanks to #12's fix)
  runner component. Initialize based on whether `overallTimerLine` exists:
  when `lineResults` first loads and finds an unfinished
  `overallTimerLine`, set `showCountdown = true` instead of letting the
  existing effect auto-start the timer directly.
- Gate the existing auto-start effect (line 103-113) on `!showCountdown` in
  addition to its current conditions — it only arms once the countdown has
  finished.
- Countdown UI: a full-screen overlay (same modal convention as
  `showGroupContinue`/`showStopConfirm` — `rgba(0,0,0,0.4)` background,
  centered card, high `zIndex`), showing "3", "2", "1" one second apart,
  covering/blocking the test screen underneath (visually "in the
  background" per the request, functionally inert since the overlay
  intercepts all clicks — same as every other modal in this app). On
  reaching 0: overlay closes, `showCountdown = false`, which lets the
  existing effect start the Overall Timer and unlocks the test screen.
- **Test Groups**: because `goToNextTest` now lands on a freshly remounted
  component instance (the #12 fix), each subsequent test in a group that
  itself has an Overall Timer line gets its own fresh countdown — no
  special-case code needed beyond the general per-mount gating above. A
  test in the group without an Overall Timer line behaves as it does today
  (no countdown, immediate access), matching the "for tests with an
  overall timer" scoping in the request.

## Files touched

- `web/src/pages/LiveTestRunnerPage.jsx` (component split for remount-on-
  sessionId-change; new countdown state, effect gating, and overlay JSX)

No data-model or Firestore changes for either item.
