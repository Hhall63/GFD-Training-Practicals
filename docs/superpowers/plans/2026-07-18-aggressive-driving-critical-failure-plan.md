# Aggressive Driving Critical Failure (Cone/Obstacle Course) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the evaluator a dedicated "Aggressive Driving — Critical Failure" control on the obstacle/cone course dashboard that, when tapped, requires a note before it can be confirmed, and unconditionally fails the recruit on that course once confirmed — a third automatic-failure trigger alongside the existing cone-count and total-time triggers.

**Architecture:** The obstacle/cone course ("EVD" driving evaluation) already has two automatic-failure triggers computed in one place, `computeObstacleCourseScore()` in `web/src/lib/obstacleCourse.js`, and rendered by three consumers: the live dashboard (`ObstacleCourseRunner.jsx`), the read-only test-sheet (`ObstacleCourseSummary.jsx`), and the failure email (`notify.js`, via `summarizeObstacleCourseLines()`). This plan adds a third trigger the same way: a new `aggressiveDriving` entry in `MARKER_TYPES`, folded into the existing marker-tally/auto-fail machinery so every consumer picks it up for free except the two that need bespoke rendering (the live dashboard's new button+modal, and the summary screen's new "AUTOMATIC FAILURE" line — mirroring the two existing ones). No new Firestore fields, no template/admin configuration — like the rest of the obstacle course, this is a fixed department rule baked into the code.

**Tech Stack:** React 18 (function components + hooks), Firebase JS SDK v10 (Firestore), Vite. No unit-test framework is installed in `web/` (`web/package.json` has no vitest/jest/test script). `web/src/lib/obstacleCourse.js` has zero imports of its own (pure functions), so Task 1 verifies it directly with a throwaway Node ESM script instead of a proper test runner; Task 2's UI is verified by driving the running app per the repo's `GFD-Training-Practicals/web:verify` skill (Firestore/Auth emulators + Playwright).

## Global Constraints

- The obstacle course line is always worth 100 points and always `isCritical: true` (`TemplateEditorPage.jsx:186-187`) — so once this new trigger sets the obstacle-course line's own `result` to `FAIL`, `computeSessionOutcome()` in `LiveTestRunnerPage.jsx:284-298` already fails the whole test via its existing `criticalFailure` check. Do not add any separate "fail the whole test" write — it must ride the existing critical-line mechanism.
- The live dashboard deliberately never reveals the running PASS/FAIL verdict to the evaluator (`ObstacleCourseRunner.jsx:161-164`, "the evaluator shouldn't see the outcome until the test is submitted"). The new control's confirmation banner may say the recruit will fail *this course* (that's the whole point of the feature), but do not add a literal PASS/FAIL badge to the live dashboard — keep that reveal on the Results screen as today.
- Reuse the existing note-required modal visual pattern verbatim: `position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)"` overlay, centered `.card`, `className="primary danger"` for the destructive/confirm button, `className="secondary"` for Cancel — see `LiveTestRunnerPage.jsx:848-898` and `BatchGradeRosterPage.jsx:171-209`.
- The new marker carries `points: 0` (it is a critical override, not a point deduction) and must be excluded from `TAP_MARKER_TYPES` (the free-tap-anywhere penalty buttons) — it gets its own dedicated button and confirm-with-note flow, not a tap-the-map-then-optionally-remove flow like cone/line/stop-line markers.

---

## File Structure

- `web/src/lib/obstacleCourse.js` **(modify)** — new `aggressiveDriving` entry in `MARKER_TYPES`; exclude it from `TAP_MARKER_TYPES`; `computeObstacleCourseScore()` gains an `autoFailAggressiveDriving` flag folded into `autoFail`; `summarizeObstacleCourseLines()` gains a matching "AUTOMATIC FAILURE" line.
- `web/src/components/ObstacleCourseSummary.jsx` **(modify)** — render the new "AUTOMATIC FAILURE: Aggressive driving critical failure" line, mirroring the existing cone/time ones.
- `web/src/components/ObstacleCourseRunner.jsx` **(modify)** — new dedicated button, confirm-with-required-note modal, recorded-state banner with a Remove control.

No other file changes: the failure email (`notify.js`) and CSV (`csv.js`) both already call `summarizeObstacleCourseLines()`/read `autoFail` generically and need no changes; `ResultsPage.jsx`/`SessionDetailPage.jsx` already surface `session.criticalFailure` generically.

---

### Task 1: Scoring/data layer — new auto-fail trigger + read-only summary line

**Files:**
- Modify: `web/src/lib/obstacleCourse.js:1-19` (docstring), `:23-35` (`MARKER_TYPES`), `:52` (`TAP_MARKER_TYPES`), `:111-143` (`computeObstacleCourseScore`), `:159-176` (`summarizeObstacleCourseLines`)
- Modify: `web/src/components/ObstacleCourseSummary.jsx:36-45`

**Interfaces:**
- Consumes: nothing new — this task only adds to existing exports.
- Produces: `MARKER_TYPES` gains a `{ key: "aggressiveDriving", label: "Aggressive Driving (Critical Failure)", short: "AD", points: 0, color: "#111111" }` entry; `computeObstacleCourseScore(config, tallies)`'s return object gains `autoFailAggressiveDriving: boolean` (true when `tallies.markers` contains any `{ type: "aggressiveDriving" }` entry) and folds it into the existing `autoFail` boolean; `summarizeObstacleCourseLines(config, tallies)`'s returned array gains a `"AUTOMATIC FAILURE: Aggressive driving critical failure"` line when that flag is set. Task 2 consumes `MARKER_TYPES`, `commit()`'s resulting `result`/`autoFail` behavior (unchanged mechanism, new trigger), and the `"aggressiveDriving"` marker `type` string as the literal it commits.

- [ ] **Step 1: Write a throwaway verification script and confirm it fails against the current code**

Create `web/scripts/verify-aggressive-driving.mjs` (not committed — deleted in Step 4):

```javascript
// web/scripts/verify-aggressive-driving.mjs
import assert from "node:assert/strict";
import {
  computeObstacleCourseScore,
  defaultObstacleCourseConfig,
  summarizeObstacleCourseLines,
} from "../src/lib/obstacleCourse.js";

const config = defaultObstacleCourseConfig();
const tallies = {
  totalSeconds: 200, // well under both the cone-count and time auto-fail thresholds
  markers: [{ type: "aggressiveDriving" }],
};

const scoring = computeObstacleCourseScore(config, tallies);
assert.equal(scoring.autoFailAggressiveDriving, true, "autoFailAggressiveDriving should be true");
assert.equal(scoring.autoFail, true, "autoFail should be true when aggressive driving is flagged");
assert.equal(scoring.autoFailCones, false, "should not also trip the cone trigger");
assert.equal(scoring.autoFailTime, false, "should not also trip the time trigger");

const lines = summarizeObstacleCourseLines(config, tallies);
assert.ok(
  lines.includes("AUTOMATIC FAILURE: Aggressive driving critical failure"),
  `expected an aggressive-driving AUTOMATIC FAILURE line, got:\n${lines.join("\n")}`
);

console.log("PASS: aggressive driving scoring/summary");
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `web/`): `node scripts/verify-aggressive-driving.mjs`
Expected: `AssertionError` — `autoFailAggressiveDriving` is `undefined`, not `true` (the field doesn't exist yet).

- [ ] **Step 3: Implement the scoring/data-layer changes**

In `web/src/lib/obstacleCourse.js`, update the module docstring (lines 3-6) to mention the third trigger:

```javascript
 * Scoring logic for the "Obstacle Course" line type — the GFD SRFF Promotional Process
 * driving/EVD evaluation. It is scored by a tiered driving time (base score) minus
 * per-penalty deductions, with three independent automatic-failure triggers: too many cone
 * penalties, too much total time, and an evaluator-flagged aggressive-driving critical
 * failure.
```

Add the new marker type to `MARKER_TYPES` (after the `stopLine` entry, before the `dist*` entries, so it stays grouped with the other non-positional-distance penalty types):

```javascript
export const MARKER_TYPES = [
  { key: "cone", label: "Cone hit", short: "C", points: 4, color: "#c4212f" },
  { key: "line", label: "Line crossed", short: "L", points: 2, color: "#1f6feb" },
  { key: "stopLine", label: "Stop line hit", short: "S", points: 10, color: "#7d2ae8" },
  // A discrete, deliberate critical event rather than a per-obstacle penalty — worth no
  // points on its own (it isn't a deduction, it's an outright course failure) and excluded
  // from TAP_MARKER_TYPES below since it needs its own confirm-with-required-note flow, not
  // the free-tap-anywhere behavior the other penalty types get.
  { key: "aggressiveDriving", label: "Aggressive Driving (Critical Failure)", short: "AD", points: 0, color: "#111111" },
  { key: "dist0", label: 'Stopped 0"–12"', short: "⓪", points: 0, color: "#2f9e44" },
  { key: "dist1", label: 'Stopped 12"–24"', short: "①", points: 2, color: "#d98200" },
  { key: "dist2", label: 'Stopped 25"–36"', short: "②", points: 4, color: "#d98200" },
  { key: "dist3", label: 'Stopped 37"+', short: "③", points: 6, color: "#d98200" },
  { key: "distDNF", label: "Did not finish", short: "DNF", points: 0, color: "#6b7280" },
];
```

Exclude it from the tap-mode buttons (line 52):

```javascript
// The mode buttons on the live runner only cover penalties placed by a free tap anywhere
// on the course; stopping-distance tiers are graded from the DISTANCE_SLOTS dropdowns
// instead, and Aggressive Driving gets its own dedicated confirm-with-note button instead
// of a tap-to-place mode.
export const TAP_MARKER_TYPES = MARKER_TYPES.filter(
  (m) => !m.key.startsWith("dist") && m.key !== "aggressiveDriving"
);
```

Fold the new trigger into `computeObstacleCourseScore` (lines 113-143):

```javascript
export function computeObstacleCourseScore(config, tallies) {
  const cfg = config ?? defaultObstacleCourseConfig();
  const totalSeconds = tallies?.totalSeconds ?? 0;
  const baseScore = scoreForTime(cfg.timeTiers, totalSeconds);

  const markers = normalizeMarkers(tallies);
  let deductions = 0;
  let totalCones = 0;
  let totalLineCrossings = 0;
  for (const m of markers) {
    deductions += POINTS_BY_TYPE[m.type] ?? 0;
    if (m.type === "cone") totalCones++;
    if (m.type === "line") totalLineCrossings++;
  }

  const autoFailCones = totalCones >= (cfg.maxConePenalties ?? Infinity);
  const autoFailTime = totalSeconds >= (cfg.maxTotalSeconds ?? Infinity);
  const autoFailAggressiveDriving = markers.some((m) => m.type === "aggressiveDriving");
  const score = Math.max(0, Math.round(baseScore - deductions));

  return {
    baseScore,
    deductions,
    totalCones,
    totalLineCrossings,
    markerCount: markers.length,
    autoFailCones,
    autoFailTime,
    autoFailAggressiveDriving,
    autoFail: autoFailCones || autoFailTime || autoFailAggressiveDriving,
    score,
  };
}
```

Add the matching summary line in `summarizeObstacleCourseLines` (after the existing `autoFailTime` block, around line 174):

```javascript
  if (scoring.autoFailTime) {
    lines.push(`AUTOMATIC FAILURE: total time ${formatClock(tallies?.totalSeconds)} exceeded ${formatClock(config?.maxTotalSeconds ?? 390)}`);
  }
  if (scoring.autoFailAggressiveDriving) {
    lines.push("AUTOMATIC FAILURE: Aggressive driving critical failure");
  }
  return lines;
```

In `web/src/components/ObstacleCourseSummary.jsx`, add a matching block after the existing `autoFailTime` block (after line 45):

```jsx
      {scoring.autoFailTime && (
        <div style={{ color: "var(--brand-red)", fontWeight: 600, fontSize: 13 }}>
          AUTOMATIC FAILURE: total time {formatClock(tallies.totalSeconds)} ≥ {formatClock(cfg.maxTotalSeconds)}
        </div>
      )}
      {scoring.autoFailAggressiveDriving && (
        <div style={{ color: "var(--brand-red)", fontWeight: 600, fontSize: 13 }}>
          AUTOMATIC FAILURE: Aggressive driving critical failure
        </div>
      )}
```

- [ ] **Step 4: Run the verification script again, confirm it passes, then delete it**

Run (from `web/`): `node scripts/verify-aggressive-driving.mjs`
Expected: `PASS: aggressive driving scoring/summary` printed, exit code 0.

Delete the throwaway script (it isn't a repo convention here — no other test scripts exist in this project):

```bash
rm web/scripts/verify-aggressive-driving.mjs
rmdir web/scripts 2>/dev/null || true
```

- [ ] **Step 5: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/obstacleCourse.js web/src/components/ObstacleCourseSummary.jsx
git commit -m "feat: add aggressive-driving as a third obstacle-course auto-fail trigger"
```

---

### Task 2: Live dashboard control — confirm-with-required-note button

**Files:**
- Modify: `web/src/components/ObstacleCourseRunner.jsx`

**Interfaces:**
- Consumes: `MARKER_TYPES`/`TAP_MARKER_TYPES` and `computeObstacleCourseScore` from Task 1's `web/src/lib/obstacleCourse.js` (the `"aggressiveDriving"` marker `type` string, and the fact that `commit()`'s existing `result: hasTime ? (finalScoring.autoFail ? RESULT.FAIL : RESULT.PASS) : null` logic already reacts to the new trigger with no changes needed to `commit()` itself); the existing `commit(next)` and `patchCurrent` already defined in this file (`ObstacleCourseRunner.jsx:51-63`, prop from `LiveTestRunnerPage.jsx`).
- Produces: nothing new consumed by other files — this is a self-contained UI addition. The marker it writes (`{ type: "aggressiveDriving" }`, no `x`/`y`) is read back generically by `normalizeMarkers`/`countMarkersByType`/`ObstacleCourseSummary.jsx` from Task 1; `CourseMap.jsx` already skips rendering any marker with `x == null` (`CourseMap.jsx:110`), so this marker intentionally never appears as a pin on the diagram.

- [ ] **Step 1: Add state and handlers**

In `web/src/components/ObstacleCourseRunner.jsx`, after the existing state declarations (after line 35, `const intervalRef = useRef(null);`), add:

```javascript
  const [showAggressiveDrivingConfirm, setShowAggressiveDrivingConfirm] = useState(false);
  const [aggressiveDrivingNote, setAggressiveDrivingNote] = useState("");
```

After the `markers`/`hasRequiredDistance`-adjacent declarations (line 46, `const markers = tallies.markers ?? [];`), add:

```javascript
  const hasAggressiveDriving = markers.some((m) => m.type === "aggressiveDriving");
```

After the existing `setDistance` function (after line 113), add:

```javascript
  // Confirms the critical failure: folds a positionless aggressiveDriving marker into the
  // tally (so computeObstacleCourseScore's autoFail picks it up the same way it already does
  // for the two existing triggers) and appends the required note onto the line's own `note`
  // field — the same field LiveTestRunnerPage's fail-note gate and the failure email already
  // read, so this note shows up everywhere a normal fail-note does with no extra wiring.
  async function confirmAggressiveDriving() {
    const trimmed = aggressiveDrivingNote.trim();
    if (!trimmed) return;
    await commit({ ...tallies, markers: [...markers, { type: "aggressiveDriving" }] });
    await patchCurrent({ note: current.note ? `${current.note}\n\n${trimmed}` : trimmed });
    setAggressiveDrivingNote("");
    setShowAggressiveDrivingConfirm(false);
  }

  // Lets the evaluator undo a mis-tap. Recomputes result/autoFail through the normal commit()
  // path, so removing it correctly reverts the step to PASS when it was the only trigger.
  function removeAggressiveDriving() {
    commit({ ...tallies, markers: markers.filter((m) => m.type !== "aggressiveDriving") });
  }
```

- [ ] **Step 2: Render the button/banner**

In the returned JSX, insert this block right after the "Pick a penalty…" instructions paragraph and before the tap-mode buttons row (after line 178, before line 180's `<div style={{ display: "flex", flexWrap: "wrap", ...`):

```jsx
      {hasAggressiveDriving ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            background: "#1a1a1a",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 12px",
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          <span>🚨 Aggressive Driving recorded — this recruit fails the course</span>
          <button
            type="button"
            className="secondary"
            style={{ width: "auto", padding: "4px 10px", flexShrink: 0 }}
            onClick={removeAggressiveDriving}
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary danger"
          style={{ width: "100%", marginBottom: 10 }}
          onClick={() => setShowAggressiveDrivingConfirm(true)}
        >
          🚨 Aggressive Driving — Critical Failure
        </button>
      )}
```

- [ ] **Step 3: Render the confirm-with-required-note modal**

Immediately before the component's closing `</div>` (the final line of the returned JSX, after the `<CourseMap .../>` element on line 237), add:

```jsx
      {showAggressiveDrivingConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowAggressiveDrivingConfirm(false)}
        >
          <div className="card" style={{ maxWidth: 340, padding: 24, textAlign: "left" }}>
            <h3 style={{ marginBottom: 8 }}>Aggressive Driving — Critical Failure</h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
              This immediately fails the recruit on this course, regardless of score. Add a
              note explaining what happened before confirming.
            </p>
            <textarea
              autoFocus
              rows={3}
              placeholder="What did the recruit do?"
              value={aggressiveDrivingNote}
              onChange={(e) => setAggressiveDrivingNote(e.target.value)}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowAggressiveDrivingConfirm(false);
                  setAggressiveDrivingNote("");
                }}
              >
                Cancel
              </button>
              <button
                className="primary danger"
                style={{ flex: 1 }}
                disabled={!aggressiveDrivingNote.trim()}
                onClick={confirmAggressiveDriving}
              >
                Confirm Critical Failure
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 5: Verify end-to-end against the running app**

Use the `GFD-Training-Practicals/web:verify` skill to start the emulator-backed harness (Firestore/Auth emulators + `VITE_USE_EMULATOR=1 npm run dev`), seed the admin login, then drive:

1. Manage Tests → build (or reuse) a template containing an Obstacle Course step.
2. Start a live test on that template, reach the Obstacle Course step, tap **Start**.
3. Tap **🚨 Aggressive Driving — Critical Failure**. Confirm the modal opens and its confirm button (`text=Confirm Critical Failure`) is disabled until the textarea has text.
4. Type a note, confirm. Expect the button to be replaced by the black "🚨 Aggressive Driving recorded…" banner with a **Remove** button, and no cone/line markers were added.
5. Tap **Remove**. Expect the banner to disappear and the original button to return.
6. Tap the button again, add a note, confirm again. Tap **Finish** to stop the course clock.
7. Advance past the step (Next/Submit) — confirm the existing "Note Required" gate does *not* re-block (the note was already saved via Step 3's `patchCurrent`), and finish the test.
8. On the Results screen, confirm: overall result is FAIL, "CRITICAL FAILURE" is shown, and the obstacle-course test-sheet shows the new "AUTOMATIC FAILURE: Aggressive driving critical failure" line alongside the evaluator's note.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ObstacleCourseRunner.jsx
git commit -m "feat: add aggressive-driving critical-failure control to the obstacle course dashboard"
```
