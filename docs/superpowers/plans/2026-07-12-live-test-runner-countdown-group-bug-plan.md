# Live Test Runner: Overall-Timer Countdown + Test-Group Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a state-leak bug where the second (and later) test in a Test Group inherits the previous test's `currentIndex`/timer state instead of starting fresh, then add a 3-2-1 countdown overlay that gates a template's Overall Timer (and the test screen) until it finishes.

**Architecture:** Split `LiveTestRunnerPage` into a thin outer component (reads `sessionId` from the route) and an inner `LiveTestRunnerRun` component keyed by `sessionId`, so React fully remounts (and re-initializes every `useState`/`useRef`) whenever the route moves to a new session — this is what makes "Go to Next Test" safe. Then add a one-time "arm" effect that shows a countdown overlay the first time a session's Overall Timer line appears unfinished, gating the existing auto-start effect until the countdown finishes.

**Tech Stack:** React 18 (hooks only, no new libraries), React Router 6, Firebase JS SDK v10 (Firestore), Vite. Verification uses the Firebase emulator suite + Playwright, per this repo's own `GFD-Training-Practicals/web:verify` skill (`web/.claude/skills/verify/SKILL.md`).

## Global Constraints

- No new npm dependencies — implement entirely with React hooks and the Firestore SDK calls already used in this file.
- No Firestore schema or security-rule changes (confirmed by the spec).
- Self-contained inside `web/src/pages/LiveTestRunnerPage.jsx` — do **not** modify `web/src/App.jsx`'s route declarations.
- This repo has **no unit test framework** (no vitest/jest in `web/package.json`). "Testing" here means (a) `npm run build` for compile-safety, and (b) driving the real app end-to-end against the Firestore/Auth emulators with Playwright, per the project's `verify` skill.
- Task 1 (the remount fix) must land and be verified **before** Task 4 (the countdown) — the countdown's per-mount gating logic depends on the remount fix for correct behavior across Test Groups (the design spec calls this out directly).
- Every code snippet below shows the complete surrounding context needed to locate the exact edit — none are abbreviated.

---

### Task 1: Fix the Test-Group session state-leak bug (component split)

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx:25-28`

**Interfaces:**
- Produces: the default-exported `LiveTestRunnerPage` component keeps the exact same external behavior (same route, same props-from-router) — this task only changes what's *inside* it, so no other file's imports change.

- [ ] **Step 1: Make the component split**

Open `web/src/pages/LiveTestRunnerPage.jsx`. The file currently starts:

```jsx
export default function LiveTestRunnerPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [sessionData, setSessionData] = useState(null);
  // ...rest of the function body, unchanged, all the way to the closing `}` on line 846...
```

Replace lines 25-28 with:

```jsx
export default function LiveTestRunnerPage() {
  const { sessionId } = useParams();
  return <LiveTestRunnerRun key={sessionId} sessionId={sessionId} />;
}

function LiveTestRunnerRun({ sessionId }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sessionData, setSessionData] = useState(null);
  // ...rest of the function body is UNCHANGED from here down. Every existing reference to
  // `sessionId` inside the body already resolves correctly, since it's now a destructured
  // prop with the same name instead of a value from useParams(). Do not touch anything
  // from this point through the closing `}` that used to end the old LiveTestRunnerPage.
```

Nothing else in the file changes. `key={sessionId}` on `<LiveTestRunnerRun>` is what makes React tear down and rebuild the entire subtree (every `useState`/`useRef` re-initializes) whenever the route moves to a new session — whether via a Test Group's "Go to Next Test" or any other in-place session change.

- [ ] **Step 2: Confirm the app still builds**

Run: `cd web && npm run build`
Expected: build succeeds with no errors (exit code 0). This only proves the split is syntactically/type-correct — Task 3 below proves it actually fixes the bug.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx
git commit -m "fix: remount LiveTestRunnerPage on session change to stop state leaking between Test Group tests"
```

---

### Task 2: Seed a two-template Test Group fixture in the emulator

**Files:**
- Create: `web/.verify/seed-group-bug-fixture.sh`

**Interfaces:**
- Consumes: a running Firestore + Auth emulator pair (started per the project's `verify` skill) and the two bootstrap docs that skill's "Seed a login" section creates (`admins/{uid}` for `verify.admin@example.com`, and `meta/appState`).
- Produces: Firestore docs `recruits/recruitX`, `templates/tplA` (+ 3 lines: 2 graded + 1 overall timer), `templates/tplB` (+ 2 lines: 1 graded + 1 overall timer), `testGroups/groupAB` (bundling `tplA` then `tplB`) — reused by both Task 3's and Task 5's Playwright scripts.

- [ ] **Step 1: Start the emulators and dev server, and seed the bootstrap admin login**

Follow the project's `verify` skill exactly (`web/.claude/skills/verify/SKILL.md`):

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training &
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort &
```

```bash
TESTUID=$(curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake" \
  -H "Content-Type: application/json" \
  -d '{"email":"verify.admin@example.com","password":"VerifyBot!2026","returnSecureToken":true}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['localId'])")

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/admins/$TESTUID" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"verify.admin@example.com"},"displayName":{"stringValue":"Verify Admin"},"role":{"stringValue":"admin"},"isActive":{"booleanValue":true}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/meta/appState" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstAdminCreated":{"booleanValue":true}}}'
```

Expected: both `curl` calls return a JSON doc body (no `"error"` key).

- [ ] **Step 2: Write the fixture-seeding script**

Create `web/.verify/seed-group-bug-fixture.sh`:

```bash
#!/usr/bin/env bash
# Seeds a deterministic two-template Test Group fixture in the Firestore emulator, used to
# verify the session-state-leak fix (Task 1/#12) and the Overall-Timer countdown (Task 4/#7).
# Run this AFTER the emulators are up and the verify.admin login + meta/appState doc exist
# (see web/.claude/skills/verify/SKILL.md).
set -euo pipefail
BASE="http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents"
AUTH=(-H "Authorization: Bearer owner" -H "Content-Type: application/json")

curl -s -X PATCH "$BASE/recruits/recruitX" "${AUTH[@]}" -d '{"fields":{
  "firstName":{"stringValue":"Casey"},
  "lastName":{"stringValue":"Rivera"},
  "recruitClassOrCohort":{"stringValue":"Recruit Class 42"},
  "isActive":{"booleanValue":true}
}}' > /dev/null

# Template A: Extend the ladder (10pts) -> Secure the base (10pts) -> Overall Timer (20pts, 300s)
curl -s -X PATCH "$BASE/templates/tplA" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Ladder Raise A"},
  "isActive":{"booleanValue":true},
  "status":{"stringValue":"published"},
  "passingPercentage":{"integerValue":"70"}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplA/lines/lineA0" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"0"},"lineType":{"stringValue":"graded"},
  "lineText":{"stringValue":"Extend the ladder"},"points":{"integerValue":"10"},
  "isCritical":{"booleanValue":false}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplA/lines/lineA1" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"1"},"lineType":{"stringValue":"graded"},
  "lineText":{"stringValue":"Secure the base"},"points":{"integerValue":"10"},
  "isCritical":{"booleanValue":false}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplA/lines/lineA2" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"2"},"lineType":{"stringValue":"overallTimer"},
  "lineText":{"stringValue":"Overall Timer"},"points":{"integerValue":"20"},
  "passThresholdSeconds":{"integerValue":"300"},"isCritical":{"booleanValue":false}
}}' > /dev/null

# Template B: Climb to the tip (10pts) -> Overall Timer (20pts, 300s)
curl -s -X PATCH "$BASE/templates/tplB" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Ladder Raise B"},
  "isActive":{"booleanValue":true},
  "status":{"stringValue":"published"},
  "passingPercentage":{"integerValue":"70"}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplB/lines/lineB0" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"0"},"lineType":{"stringValue":"graded"},
  "lineText":{"stringValue":"Climb to the tip"},"points":{"integerValue":"10"},
  "isCritical":{"booleanValue":false}
}}' > /dev/null
curl -s -X PATCH "$BASE/templates/tplB/lines/lineB1" "${AUTH[@]}" -d '{"fields":{
  "sortOrder":{"integerValue":"1"},"lineType":{"stringValue":"overallTimer"},
  "lineText":{"stringValue":"Overall Timer"},"points":{"integerValue":"20"},
  "passThresholdSeconds":{"integerValue":"300"},"isCritical":{"booleanValue":false}
}}' > /dev/null

curl -s -X PATCH "$BASE/testGroups/groupAB" "${AUTH[@]}" -d '{"fields":{
  "name":{"stringValue":"Ladder Raise Group"},
  "isActive":{"booleanValue":true},
  "templateIds":{"arrayValue":{"values":[{"stringValue":"tplA"},{"stringValue":"tplB"}]}}
}}' > /dev/null

echo "Fixture seeded: recruitX, tplA (3 lines), tplB (2 lines), testGroups/groupAB"
```

- [ ] **Step 2: Run it and confirm the seed**

```bash
chmod +x web/.verify/seed-group-bug-fixture.sh
./web/.verify/seed-group-bug-fixture.sh
```

Expected output: `Fixture seeded: recruitX, tplA (3 lines), tplB (2 lines), testGroups/groupAB`

Then confirm the group doc is actually readable back:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/testGroups/groupAB" \
  -H "Authorization: Bearer owner"
```

Expected: JSON containing `"name":{"stringValue":"Ladder Raise Group"}` and a `templateIds` array with `tplA` and `tplB`.

- [ ] **Step 3: Commit**

```bash
git add web/.verify/seed-group-bug-fixture.sh
git commit -m "test: add emulator fixture seed script for the Test Group state-leak regression"
```

---

### Task 3: Playwright-verify the Task 1 fix

**Files:**
- Create: `web/.verify/verify-group-bug.cjs`

**Interfaces:**
- Consumes: the dev server from Task 2 Step 1 (`http://127.0.0.1:5178`), the fixture from Task 2 (`recruitX`, `tplA`, `tplB`, `testGroups/groupAB`), and the `verify.admin@example.com` / `VerifyBot!2026` login.
- Produces: a pass/fail console report proving the fix from Task 1.

- [ ] **Step 1: Write the verification script**

Create `web/.verify/verify-group-bug.cjs`:

```js
// Drives the two-template Test Group fixture through the real UI and asserts the Task 1
// fix: the second test in the group starts at its own line 0 with its own fresh Overall
// Timer, instead of inheriting the first test's currentIndex/isOverallRunning state.
//
// Without the fix: Template A ends at currentIndex 2 (its last line). Template B only has
// 2 lines (indices 0-1), so index 2 is out of range there, and isOverallRunning is stuck
// `true` from Template A, so Template B's own Overall Timer banner never starts ticking.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const BASE_URL = "http://127.0.0.1:5178";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${BASE_URL}/login`);
  await page.fill("#login-email", "verify.admin@example.com");
  await page.fill("#login-password", "VerifyBot!2026");
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(BASE_URL + "/");

  await page.goto(`${BASE_URL}/test/group/groupAB`);
  await page.click('.recruit-tile:has-text("Casey Rivera")');
  await page.click('button:has-text("Begin Test")');

  // Template A: two Graded steps, then the Overall Timer line finalized via Stop Test.
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('.overall-timer-banner button:has-text("Stop Test")');
  await page.click('.card:has(h3:has-text("Stop Test?")) button:has-text("Yes, Stop Test")');
  await page.click('.card:has(h3:has-text("Test Complete")) button:has-text("Go to Next Test")');

  // Now on Template B's session.
  await page.waitForSelector("text=Line 1 of 2", { timeout: 5000 });

  const bannerBefore = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(1500);
  const bannerAfter = await page.textContent(".overall-timer-banner span");
  if (bannerBefore === bannerAfter) {
    throw new Error(`Overall Timer banner did not advance on Template B: stuck at "${bannerBefore}"`);
  }

  console.log("PASS: Template B started at Line 1 of 2 with its own running Overall Timer.");
  console.log(`  banner: "${bannerBefore}" -> "${bannerAfter}"`);
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

Run: `node web/.verify/verify-group-bug.cjs`
Expected: exits 0, prints `PASS: Template B started at Line 1 of 2 with its own running Overall Timer.` followed by the two banner readings (different values). If Task 1's fix were reverted, this script fails at the `waitForSelector("text=Line 1 of 2")` line (Template B would render around the stale, out-of-range `currentIndex` from Template A instead).

- [ ] **Step 3: Reset the emulator's Firestore data before the next task**

```bash
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/gfd-recruit-training/databases/(default)/documents"
./web/.verify/seed-group-bug-fixture.sh
```

(Per the `verify` skill: this wipes Firestore only, not Auth — the `verify.admin` login survives, so re-seed only the fixture, not the admin/meta docs.)

- [ ] **Step 4: Commit**

```bash
git add web/.verify/verify-group-bug.cjs
git commit -m "test: add Playwright verification for the Test Group state-leak fix"
```

---

### Task 4: Add the 3-2-1 countdown before the Overall Timer starts

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx` (inside `LiveTestRunnerRun`, from Task 1)

**Interfaces:**
- Consumes: `overallTimerLine` (already derived in the file, unchanged), the existing `overallStartRef`/`overallIntervalRef`/`isOverallRunning`/`setOverallElapsed` from the Overall Timer auto-start effect.
- Produces: new state `showCountdown` (boolean) and `countdownValue` (number, 3→0), rendered as a full-screen overlay with class `countdown-digit` on the digit element (used by Task 5's verification script).

- [ ] **Step 1: Add the countdown state, next to the other Overall Timer state**

Find (around line 68-73):

```jsx
  const [overallElapsed, setOverallElapsed] = useState(0);
  const [isOverallRunning, setIsOverallRunning] = useState(false);
  const [overallPauseEvents, setOverallPauseEvents] = useState([]);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const overallStartRef = useRef(null);
  const overallIntervalRef = useRef(null);
```

Replace with:

```jsx
  const [overallElapsed, setOverallElapsed] = useState(0);
  const [isOverallRunning, setIsOverallRunning] = useState(false);
  const [overallPauseEvents, setOverallPauseEvents] = useState([]);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const overallStartRef = useRef(null);
  const overallIntervalRef = useRef(null);
  // 3-2-1 countdown shown before a template's Overall Timer starts. countdownArmedRef is a
  // one-time latch (a ref, not state) so the countdown is offered exactly once per session.
  // overallTimerLine's object identity changes again later in the test (every patchLine()
  // write touches it, e.g. Stop Test finalizing it) — without this latch, the arm-effect
  // below would fire again on that later change and reopen the countdown mid-test.
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const countdownArmedRef = useRef(false);
```

- [ ] **Step 2: Add the "arm the countdown once" effect, right after `overallTimerLine` is derived**

Find (around line 95-97):

```jsx
  // The whole-test line, if this template has one — found fresh on every render so it picks
  // up the result/pauseEvents patchLine() writes once Stop Test finalizes it.
  const overallTimerLine = lineResults?.find((l) => l.lineTypeSnapshot === LINE_TYPES.OVERALL_TIMER);
```

Add immediately after it (before the existing auto-start effect):

```jsx
  // Arms the countdown exactly once per session, the first time this session's Overall
  // Timer line is seen unfinished. Templates without an Overall Timer line never set this —
  // overallTimerLine stays undefined, so the countdown never shows, same as today.
  useEffect(() => {
    if (overallTimerLine && overallTimerLine.result == null && !countdownArmedRef.current) {
      countdownArmedRef.current = true;
      setShowCountdown(true);
    }
  }, [overallTimerLine]);

  // Ticks the countdown down from 3 to 0, one second at a time, then closes the overlay.
  useEffect(() => {
    if (!showCountdown) return;
    if (countdownValue === 0) {
      setShowCountdown(false);
      return;
    }
    const timeout = setTimeout(() => setCountdownValue((v) => v - 1), 1000);
    return () => clearTimeout(timeout);
  }, [showCountdown, countdownValue]);
```

- [ ] **Step 3: Gate the existing Overall Timer auto-start effect on the countdown being done**

Find (the existing effect right after the two new ones):

```jsx
  useEffect(() => {
    if (overallTimerLine && overallTimerLine.result == null && !isOverallRunning) {
      overallStartRef.current = Date.now();
      setIsOverallRunning(true);
      overallIntervalRef.current = setInterval(() => {
        setOverallElapsed((Date.now() - overallStartRef.current) / 1000);
      }, 100);
    }
    return () => clearInterval(overallIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overallTimerLine]);
```

Replace with:

```jsx
  useEffect(() => {
    if (overallTimerLine && overallTimerLine.result == null && !isOverallRunning && !showCountdown) {
      overallStartRef.current = Date.now();
      setIsOverallRunning(true);
      overallIntervalRef.current = setInterval(() => {
        setOverallElapsed((Date.now() - overallStartRef.current) / 1000);
      }, 100);
    }
    return () => clearInterval(overallIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overallTimerLine, showCountdown]);
```

Adding `showCountdown` to the dependency array is what makes the timer actually arm the moment the countdown finishes (`showCountdown` flips `false` in Step 2's ticking effect) — without it in the deps, this effect would never re-run just because `showCountdown` changed.

- [ ] **Step 4: Render the countdown overlay**

Find the top of the returned JSX (around line 512-517):

```jsx
  return (
    <div className="app-shell">
      {/* Rendered above/outside Task 8's viewMode branch below, so this whole-test banner and
          its controls show in every view (Standard/Checklist/Tile) and are never affected by
          switching views. */}
      {overallTimerLine && (
```

Insert the overlay right after `<div className="app-shell">`, before that comment:

```jsx
  return (
    <div className="app-shell">
      {showCountdown && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
        >
          <div className="card" style={{ padding: "40px 56px", textAlign: "center" }}>
            <p className="muted" style={{ marginBottom: 8 }}>Overall Timer starts in</p>
            <div className="countdown-digit" style={{ fontSize: 72, fontWeight: 700 }}>
              {countdownValue}
            </div>
          </div>
        </div>
      )}
      {/* Rendered above/outside Task 8's viewMode branch below, so this whole-test banner and
          its controls show in every view (Standard/Checklist/Tile) and are never affected by
          switching views. */}
      {overallTimerLine && (
```

The overlay's `position: fixed; inset: 0` covers the full screen and intercepts all clicks underneath — same convention as every other modal in this file (`showStopConfirm`, `showGroupContinue`, etc.) — so the test screen is visually present but not interactive until the countdown ends, matching the request.

- [ ] **Step 5: Confirm the app still builds**

Run: `cd web && npm run build`
Expected: build succeeds with no errors (exit code 0).

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx
git commit -m "feat: add 3-2-1 countdown before a template's Overall Timer starts"
```

---

### Task 5: Playwright-verify the countdown, including across a Test Group transition

**Files:**
- Create: `web/.verify/verify-countdown.cjs`

**Interfaces:**
- Consumes: the same dev server, fixture, and login as Task 3 (re-seeded at the end of Task 3, Step 3).
- Produces: a pass/fail console report proving both the single-session countdown behavior and that Template B (the second test in the group) gets its own fresh countdown.

- [ ] **Step 1: Write the verification script**

Create `web/.verify/verify-countdown.cjs`:

```js
// Verifies the Task 4 countdown: it must block the Overall Timer (and the test screen)
// until it finishes, and — because of Task 1's remount fix — the second test in a Test
// Group must get its own fresh countdown too, not skip straight to a running timer.
const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const BASE_URL = "http://127.0.0.1:5178";

async function expectCountdownThenRunningTimer(page) {
  await page.waitForSelector("text=Overall Timer starts in", { timeout: 5000 });
  const digitAtStart = await page.textContent(".countdown-digit");
  if (digitAtStart.trim() !== "3") {
    throw new Error(`Expected the countdown to start at 3, got "${digitAtStart}"`);
  }

  const bannerBefore = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(800);
  const bannerDuring = await page.textContent(".overall-timer-banner span");
  if (bannerBefore !== bannerDuring) {
    throw new Error("Overall Timer advanced during the countdown — it should be frozen.");
  }

  await page.waitForSelector("text=Overall Timer starts in", { state: "detached", timeout: 5000 });

  const bannerAfter1 = await page.textContent(".overall-timer-banner span");
  await page.waitForTimeout(1000);
  const bannerAfter2 = await page.textContent(".overall-timer-banner span");
  if (bannerAfter1 === bannerAfter2) {
    throw new Error(`Overall Timer did not start after the countdown: stuck at "${bannerAfter1}"`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${BASE_URL}/login`);
  await page.fill("#login-email", "verify.admin@example.com");
  await page.fill("#login-password", "VerifyBot!2026");
  await page.click('button:has-text("Sign In")');
  await page.waitForURL(BASE_URL + "/");

  await page.goto(`${BASE_URL}/test/group/groupAB`);
  await page.click('.recruit-tile:has-text("Casey Rivera")');
  await page.click('button:has-text("Begin Test")');

  // Template A.
  await expectCountdownThenRunningTimer(page);
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('button:has-text("Pass")');
  await page.click('button:has-text("Next")');
  await page.click('.overall-timer-banner button:has-text("Stop Test")');
  await page.click('.card:has(h3:has-text("Stop Test?")) button:has-text("Yes, Stop Test")');
  await page.click('.card:has(h3:has-text("Test Complete")) button:has-text("Go to Next Test")');

  // Template B must get its own fresh countdown, not inherit A's already-finished one.
  await expectCountdownThenRunningTimer(page);
  await page.click('button:has-text("Pass")'); // confirms the test screen is interactive now

  console.log("PASS: countdown gated the Overall Timer on both tests in the group.");
  await browser.close();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

Run: `node web/.verify/verify-countdown.cjs`
Expected: exits 0, prints `PASS: countdown gated the Overall Timer on both tests in the group.`

- [ ] **Step 3: Manually confirm a template *without* an Overall Timer line is unaffected**

```bash
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/templates/tplC" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"name":{"stringValue":"No Timer Test"},"isActive":{"booleanValue":true},"status":{"stringValue":"published"},"passingPercentage":{"integerValue":"70"}}}'
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/templates/tplC/lines/lineC0" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"sortOrder":{"integerValue":"0"},"lineType":{"stringValue":"graded"},"lineText":{"stringValue":"Simple step"},"points":{"integerValue":"10"},"isCritical":{"booleanValue":false}}}'
```

Then, in a browser at `http://127.0.0.1:5178`, log in, go to `/test/tplC`, pick the recruit, click Begin Test, and confirm the Graded step's Pass/Fail buttons are immediately clickable — no countdown overlay, no Overall Timer banner. This is the "templates without an Overall Timer line are unchanged" requirement from the spec, and it's a one-off manual check because it proves an *absence* of behavior, which isn't worth a scripted assertion here.

- [ ] **Step 4: Commit**

```bash
git add web/.verify/verify-countdown.cjs
git commit -m "test: add Playwright verification for the Overall Timer countdown"
```

---

## Self-Review Notes

- **Spec coverage:** #12 (root cause + component-split fix) → Task 1. #7 (countdown state, gating, overlay, Test Group behavior) → Task 4. Both verified end-to-end (Tasks 3 and 5), including the "templates without an Overall Timer are unchanged" scoping (Task 5, Step 3).
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code or commands.
- **Type consistency:** `showCountdown`/`countdownValue`/`countdownArmedRef` are introduced once in Task 4 Step 1 and used with the same names in every later step; `overallTimerLine`, `isOverallRunning`, `overallStartRef`, `overallIntervalRef` are pre-existing names reused exactly as they already appear in the file.
