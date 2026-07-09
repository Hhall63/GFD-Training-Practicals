# Bold Command Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give GFD Recruit Testing a bolder, more official "Bold Command" visual style (stronger navy/gold/red contrast, status color-bars, heavier CTAs) across every screen, with no UX/flow or logic changes.

**Architecture:** Extend the existing hand-written `web/src/styles/theme.css` design system with new tokens and a few reusable classes (status-tinted card modifier, segmented-control, heavier button/badge treatment), then reconcile each page's inline styles to use them, in four phases: foundation → field-facing screens → admin/management screens → reporting screens.

**Tech Stack:** React 18 + Vite, plain CSS (`theme.css`), no CSS framework, no test framework — this app has none today.

## Global Constraints

- No new npm dependencies (spec: stay within the existing plain-CSS system).
- No UX/flow, routing, or business-logic changes — pure styling.
- No dark mode (out of scope; app has none today).
- **No automated test suite exists for this app** (no Jest/Vitest/RTL, no visual regression tooling), so this plan replaces the usual "write failing test → make it pass" cycle with: **make the edit → `npm run build` (catches syntax/JSX errors) → manually verify the specific screen via the `GFD-Training-Practicals/web:verify` skill or `npm run dev` → commit.** This was agreed in the design spec (`docs/superpowers/specs/2026-07-08-bold-command-visual-refresh-design.md`, section 4).
- Run all commands from the `web/` directory (e.g. `cd web && npm run build`).
- Every task's commit is scoped to just the files that task touches.

---

## Task 1: Design tokens and core component classes

**Files:**
- Modify: `web/src/styles/theme.css`

**Interfaces:**
- Produces: CSS custom properties `--brand-navy-2`, `--shadow-sm`, `--shadow-md`, `--status-pass`, `--status-fail`, `--status-progress`; classes `.card--pass`, `.card--fail`, `.card--progress`, `.segmented`, `.segment`, `.segment.active`. Every later task in this plan consumes these.

- [ ] **Step 1: Add the new tokens to `:root`**

In `web/src/styles/theme.css`, replace:

```css
:root {
  --brand-navy: #12123a;
  --brand-red: #c4212f;
  --brand-gold: #d3a85f;
  --bg: #f4f4f7;
  --surface: #ffffff;
  --text: #1c1c28;
  --text-secondary: #6b6b76;
  --border: #e1e1e8;
  --success: #1f8a3b;
  --danger: var(--brand-red);
  --radius: 14px;
}
```

with:

```css
:root {
  --brand-navy: #12123a;
  --brand-navy-2: #1c1c56;
  --brand-red: #c4212f;
  --brand-gold: #d3a85f;
  --bg: #f4f4f7;
  --surface: #ffffff;
  --text: #1c1c28;
  --text-secondary: #6b6b76;
  --border: #e1e1e8;
  --success: #1f8a3b;
  --danger: var(--brand-red);
  --radius: 14px;
  --shadow-sm: 0 2px 6px rgba(18, 18, 58, 0.12);
  --shadow-md: 0 4px 14px rgba(18, 18, 58, 0.18);
  --status-pass: var(--success);
  --status-fail: var(--brand-red);
  --status-progress: var(--brand-gold);
}
```

- [ ] **Step 2: Give `.card` elevation, and add status modifiers**

Replace:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
}
```

with:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: var(--shadow-sm);
}

.card--pass,
.card--fail,
.card--progress {
  border-left-width: 4px;
  border-left-style: solid;
}

.card--pass {
  border-left-color: var(--status-pass);
}

.card--fail {
  border-left-color: var(--status-fail);
}

.card--progress {
  border-left-color: var(--status-progress);
}
```

- [ ] **Step 3: Give primary buttons a heavier, colored-shadow CTA feel**

Replace:

```css
button.primary {
  width: 100%;
  padding: 14px;
  font-size: 17px;
  font-weight: 600;
  color: white;
  background: var(--brand-navy);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
}

button.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

button.primary.danger {
  background: var(--brand-red);
}

button.primary.success {
  background: var(--success);
}

button.primary.warning {
  background: var(--brand-gold);
  color: var(--brand-navy);
}
```

with:

```css
button.primary {
  width: 100%;
  padding: 14px;
  font-size: 17px;
  font-weight: 600;
  color: white;
  background: var(--brand-navy);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  box-shadow: var(--shadow-md);
}

button.primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

button.primary.danger {
  background: var(--brand-red);
  box-shadow: 0 3px 10px rgba(196, 33, 47, 0.35);
}

button.primary.success {
  background: var(--success);
  box-shadow: 0 3px 10px rgba(31, 138, 59, 0.3);
}

button.primary.warning {
  background: var(--brand-gold);
  color: var(--brand-navy);
  box-shadow: 0 3px 10px rgba(211, 168, 95, 0.35);
}
```

- [ ] **Step 4: Bolder badges, a default heading scale, and the segmented-control classes**

Replace:

```css
.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
```

with:

```css
.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

h1,
h2,
h3,
h4 {
  font-weight: 700;
  margin: 0 0 8px;
}

.segmented {
  display: flex;
  gap: 6px;
}

.segment {
  flex: 1;
  padding: 8px 4px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text);
  cursor: pointer;
}

.segment.active {
  background: var(--brand-navy);
  color: white;
  border-color: var(--brand-navy);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 5: Verify the build still succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors (this is a pure CSS addition — nothing references the new classes yet, so no visual change is expected in the app itself).

- [ ] **Step 6: Commit**

```bash
git add web/src/styles/theme.css
git commit -m "Add Bold Command design tokens and shared component classes"
```

---

## Task 2: TopBar and timer banner — Bold Command header

**Files:**
- Modify: `web/src/styles/theme.css`

**Interfaces:**
- Consumes: `--brand-navy-2`, `--brand-gold` (Task 1).

- [ ] **Step 1: Apply the gradient + gold border to `.top-bar` and `.timer-banner`**

Replace:

```css
.top-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  /* env(safe-area-inset-top) clears the iPhone status bar/notch/Dynamic Island when this
     app is installed to the Home Screen (standalone mode) — without it, the bar sits at
     the very top of the screen and the clock/battery/signal icons overlap it. */
  padding: calc(14px + env(safe-area-inset-top)) 16px 14px;
  background: var(--brand-navy);
  color: white;
}
```

with:

```css
.top-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  /* env(safe-area-inset-top) clears the iPhone status bar/notch/Dynamic Island when this
     app is installed to the Home Screen (standalone mode) — without it, the bar sits at
     the very top of the screen and the clock/battery/signal icons overlap it. */
  padding: calc(14px + env(safe-area-inset-top)) 16px 14px;
  background: linear-gradient(135deg, var(--brand-navy), var(--brand-navy-2));
  border-bottom: 3px solid var(--brand-gold);
  color: white;
}
```

Replace:

```css
.timer-banner {
  position: sticky;
  top: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  gap: 10px;
  /* Same safe-area clearance as .top-bar — the live test runner has no header above this
     banner, so it needs its own clearance from the iPhone status bar/notch. */
  padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
  background: var(--brand-navy);
  color: white;
}
```

with:

```css
.timer-banner {
  position: sticky;
  top: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  gap: 10px;
  /* Same safe-area clearance as .top-bar — the live test runner has no header above this
     banner, so it needs its own clearance from the iPhone status bar/notch. */
  padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
  background: linear-gradient(135deg, var(--brand-navy), var(--brand-navy-2));
  border-bottom: 3px solid var(--brand-gold);
  color: white;
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill (or `npm run dev`) to load the Home screen and confirm the top bar now shows a navy-to-navy-2 gradient with a gold bottom border. Also start a timed test step in the Live Test Runner to confirm the timer banner matches.

- [ ] **Step 4: Commit**

```bash
git add web/src/styles/theme.css
git commit -m "Give the top bar and timer banner a gradient header with gold border"
```

---

## Task 3: Auth screens — Login, Connection Error, Setup Admin

**Files:**
- Modify: `web/src/pages/LoginPage.jsx`
- Modify: `web/src/pages/ConnectionErrorPage.jsx`
- Modify: `web/src/pages/SetupAdminPage.jsx`

**Interfaces:**
- Consumes: `.card` elevation, `button.primary` shadow (Task 1) — applied automatically, no JSX change needed for those. This task only touches the pages' own bespoke bits.

- [ ] **Step 1: Wrap the "why you're here" copy on LoginPage in a subtle card so the auth screen doesn't read as a flat form**

In `web/src/pages/LoginPage.jsx`, replace:

```jsx
      <img src={badge} alt="GFD Badge" style={{ width: 140, marginBottom: 16 }} />
      <h2 style={{ margin: "0 0 4px" }}>GFD Recruit Testing</h2>
      <p className="muted" style={{ marginTop: 0 }}>Greensboro Fire Department</p>
```

with:

```jsx
      <img src={badge} alt="GFD Badge" style={{ width: 140, marginBottom: 16 }} />
      <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>GFD Recruit Testing</h2>
      <p className="muted" style={{ marginTop: 0, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700 }}>
        Greensboro Fire Department
      </p>
```

- [ ] **Step 2: Give ConnectionErrorPage's warning icon/heading the department-red treatment consistently and keep the instructions card as-is (it already uses `.card`, which now has elevation for free)**

In `web/src/pages/ConnectionErrorPage.jsx`, replace:

```jsx
      <div style={{ fontSize: 44 }}>⚠️</div>
      <h2 style={{ margin: "4px 0", color: "var(--brand-red)" }}>Error!</h2>
```

with:

```jsx
      <div style={{ fontSize: 44 }}>⚠️</div>
      <h2 style={{ margin: "4px 0", color: "var(--brand-red)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Error!
      </h2>
```

- [ ] **Step 3: Match SetupAdminPage's welcome heading style to LoginPage's**

In `web/src/pages/SetupAdminPage.jsx`, replace:

```jsx
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <h2 style={{ margin: "0 0 4px" }}>Welcome</h2>
```

with:

```jsx
      <img src={badge} alt="GFD Badge" style={{ width: 110, marginBottom: 12 }} />
      <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>Welcome</h2>
```

- [ ] **Step 4: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load `/login` and (on a fresh/emulated project with no admin yet) `/setup`, and trigger a connection error state to check `ConnectionErrorPage`. Confirm headings read navy/red and bold, and the department line on Login is uppercase.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/LoginPage.jsx web/src/pages/ConnectionErrorPage.jsx web/src/pages/SetupAdminPage.jsx
git commit -m "Apply Bold Command heading treatment to the auth screens"
```

---

## Task 4: Home screens — HomePage and RecruitHomePage

**Files:**
- Modify: `web/src/pages/HomePage.jsx`
- Modify: `web/src/pages/RecruitHomePage.jsx`

**Interfaces:**
- Consumes: `.card--pass`, `.card--fail` (Task 1).

- [ ] **Step 1: Bold the HomePage section heading**

In `web/src/pages/HomePage.jsx`, replace:

```jsx
        <h3 style={{ marginTop: 16 }}>Select a Test</h3>
```

with:

```jsx
        <h3 style={{ marginTop: 16, color: "var(--brand-navy)" }}>Select a Test</h3>
```

- [ ] **Step 2: Give RecruitHomePage's per-test status cards the colored left-bar treatment matching their badge tone**

In `web/src/pages/RecruitHomePage.jsx`, replace:

```jsx
        {templates.map((template) => {
          const status = statusByTemplate[template.id];
          return (
            <div key={template.id} className="card">
```

with:

```jsx
        {templates.map((template) => {
          const status = statusByTemplate[template.id];
          const cardModifier = status.tone === "pass" ? " card--pass" : status.tone === "fail" ? " card--fail" : "";
          return (
            <div key={template.id} className={`card${cardModifier}`}>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to sign in as an admin/evaluator and load `/` (HomePage), then sign in as a recruit with at least one passed and one failed test and load `/` (RecruitHomePage). Confirm the recruit's passed test card has a green left bar and the failed one has a red left bar.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/HomePage.jsx web/src/pages/RecruitHomePage.jsx
git commit -m "Apply Bold Command styling to the Home and Recruit Home screens"
```

---

## Task 5: RecruitConfirmPage

**Files:**
- Modify: `web/src/pages/RecruitConfirmPage.jsx`

**Interfaces:**
- Consumes: `button.primary` shadow, `.card` elevation (Task 1, applied automatically — no change needed for those elements here).

- [ ] **Step 1: Bold the confirmed-recruit name heading**

Replace:

```jsx
            <h2 style={{ margin: "0 0 4px" }}>{selected.firstName} {selected.lastName}</h2>
```

with:

```jsx
            <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>{selected.firstName} {selected.lastName}</h2>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to start a test, search and select a recruit, and confirm the recruit's name on the confirmation screen reads in navy bold.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/RecruitConfirmPage.jsx
git commit -m "Apply Bold Command heading treatment to Recruit Confirm screen"
```

---

## Task 6: LiveTestRunnerPage

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx`

**Interfaces:**
- Consumes: `.card` elevation, `button.primary`/`.badge` treatment (Task 1, applied automatically), gradient `.timer-banner` (Task 2, applied automatically).

- [ ] **Step 1: Use the border token instead of a hardcoded hex for the progress bar track**

Replace:

```jsx
          <div style={{ height: 6, background: "#e1e1e8", borderRadius: 3, overflow: "hidden" }}>
```

with:

```jsx
          <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to run through a full test: an instruction line, a timer line (start/stop, see the PASS/FAIL badge in its new bold uppercase style), a graded line, the Note Required and Return to Home modals (now with `.card` elevation), and Submit. Confirm nothing regresses functionally.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx
git commit -m "Apply Bold Command styling to the Live Test Runner screen"
```

---

## Task 7: Obstacle Course components

**Files:**
- Modify: `web/src/components/ObstacleCourseRunner.jsx`
- Modify: `web/src/components/CourseMap.jsx`

**Interfaces:**
- Consumes: `.card` elevation, `button.primary`/`.primary.warning`/`.primary.success`/`.primary.danger` shadows (Task 1, applied automatically to the Pause/Resume/Finish/Start buttons — no change needed for those).
- `ObstacleCourseSummary.jsx` and `CourseDiagram.jsx` need no changes: the summary only uses `.muted`/inline text colors already on-brand, and the diagram is pure SVG course geometry with no themable chrome.

- [ ] **Step 1: Match the course map's border-radius to the design system's `--radius` instead of a hardcoded `10`**

In `web/src/components/CourseMap.jsx`, replace:

```jsx
      style={{
        position: "relative",
        width: "100%",
        lineHeight: 0,
        border: "1px solid var(--border)",
        borderRadius: 10,
        // Overlays (distance dropdowns) must never be invisibly clipped, so the rounded-
        // corner crop lives on the diagram wrapper below instead of on this container.
        overflow: "visible",
        cursor: onTap ? "crosshair" : "default",
        touchAction: "manipulation",
      }}
    >
      <div style={{ borderRadius: 10, overflow: "hidden", lineHeight: 0, background: "#fff" }}>
```

with:

```jsx
      style={{
        position: "relative",
        width: "100%",
        lineHeight: 0,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        // Overlays (distance dropdowns) must never be invisibly clipped, so the rounded-
        // corner crop lives on the diagram wrapper below instead of on this container.
        overflow: "visible",
        cursor: onTap ? "crosshair" : "default",
        touchAction: "manipulation",
      }}
    >
      <div style={{ borderRadius: "var(--radius)", overflow: "hidden", lineHeight: 0, background: "#fff" }}>
```

- [ ] **Step 2: Give the "Projected Score" card in ObstacleCourseRunner a bit more visual weight to match the Bold Command card style**

In `web/src/components/ObstacleCourseRunner.jsx`, replace:

```jsx
      <div className="card" style={{ textAlign: "left", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
          <span>Projected Score</span>
          <span>{scoring.score} / 100</span>
        </div>
      </div>
```

with:

```jsx
      <div className="card" style={{ textAlign: "left", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 13, color: "var(--text-secondary)" }}>
            Projected Score
          </span>
          <span style={{ color: "var(--brand-navy)" }}>{scoring.score} / 100</span>
        </div>
      </div>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to run the obstacle-course test line: start the stopwatch, tap a few penalty markers on the course map, set both required stopping distances, pause/resume, and finish. Confirm the course map corners match the app's standard rounding and the Projected Score card reads clearly.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ObstacleCourseRunner.jsx web/src/components/CourseMap.jsx
git commit -m "Apply Bold Command styling to the obstacle course runner and map"
```

---

## Task 8: ResultsPage

**Files:**
- Modify: `web/src/pages/ResultsPage.jsx`

**Interfaces:**
- Consumes: `.card--pass`, `.card--fail`, `.badge` treatment (Task 1).

- [ ] **Step 1: Wrap the PASS/FAIL verdict in a status-colored card — the biggest single "verdict" moment in the app**

Replace:

```jsx
      <div className="screen center-column" style={{ paddingTop: 32 }}>
        <div style={{ fontSize: 56 }}>{passed ? "✅" : "❌"}</div>
        <h1 style={{ color: passed ? "var(--success)" : "var(--brand-red)", margin: "4px 0" }}>
          {passed ? "PASS" : "FAIL"}
        </h1>
        {session.criticalFailure && (
          <p style={{ color: "var(--brand-red)", fontWeight: 700, margin: "0 0 4px" }}>
            Critical step failed — automatic test failure
          </p>
        )}
        {session.attemptType === "retake" && (
          <span className="badge neutral" style={{ marginBottom: 4 }}>Retake</span>
        )}
        <p style={{ fontWeight: 600, fontSize: 18, margin: "8px 0 2px" }}>{session.recruitName}</p>
        <p className="muted" style={{ margin: 0 }}>{session.templateName}</p>
        {session.totalPointsPossible > 0 && (
          <p style={{ fontWeight: 600, marginTop: 8 }}>
            {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
            {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% —
            needed {session.passingPercentageSnapshot}% to pass)
          </p>
        )}
```

with:

```jsx
      <div className="screen center-column" style={{ paddingTop: 32 }}>
        <div className={`card ${passed ? "card--pass" : "card--fail"}`} style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ fontSize: 56 }}>{passed ? "✅" : "❌"}</div>
          <h1 style={{ color: passed ? "var(--success)" : "var(--brand-red)", margin: "4px 0" }}>
            {passed ? "PASS" : "FAIL"}
          </h1>
          {session.criticalFailure && (
            <p style={{ color: "var(--brand-red)", fontWeight: 700, margin: "0 0 4px" }}>
              Critical step failed — automatic test failure
            </p>
          )}
          {session.attemptType === "retake" && (
            <span className="badge neutral" style={{ marginBottom: 4 }}>Retake</span>
          )}
          <p style={{ fontWeight: 600, fontSize: 18, margin: "8px 0 2px" }}>{session.recruitName}</p>
          <p className="muted" style={{ margin: 0 }}>{session.templateName}</p>
          {session.totalPointsPossible > 0 && (
            <p style={{ fontWeight: 600, marginTop: 8 }}>
              {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
              {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% —
              needed {session.passingPercentageSnapshot}% to pass)
            </p>
          )}
        </div>
```

Note: `.card` centers text via the parent's `.center-column`, and the card's own `text-align` isn't set — it inherits `center-column`'s `text-align: center`, so this nests cleanly without extra styling.

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to finish a test both ways (a passing run and a failing run) and confirm the Results screen shows the verdict inside a card with a green (pass) or red (fail) left bar, and that the rest of the screen (line-by-line results, email status block, Return to Home button) is unaffected.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/ResultsPage.jsx
git commit -m "Wrap the Results verdict in a Bold Command status card"
```

---

## Task 9: Segmented-control refactor (Admins, Templates Admin, Template Editor)

This is a DRY cleanup: `AdminsPage.jsx` (role filter + new-user role toggle) and `TemplatesAdminPage.jsx` (draft/published filter) and `TemplateEditorPage.jsx` (line-type picker) each hand-roll an identical inline "pill toggle" block. Replacing all four with the `.segmented`/`.segment` classes from Task 1 means the Bold Command look (and any future tweak) only has to be made once.

**Files:**
- Modify: `web/src/pages/AdminsPage.jsx`
- Modify: `web/src/pages/TemplatesAdminPage.jsx`
- Modify: `web/src/pages/TemplateEditorPage.jsx`

**Interfaces:**
- Consumes: `.segmented`, `.segment`, `.segment.active` (Task 1).

- [ ] **Step 1: AdminsPage role filter**

In `web/src/pages/AdminsPage.jsx`, replace:

```jsx
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {ROLE_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRoleFilter(value)}
              style={{
                flex: 1,
                padding: "8px 4px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: roleFilter === value ? "var(--brand-navy)" : "white",
                color: roleFilter === value ? "white" : "var(--text)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
```

with:

```jsx
        <div className="segmented" style={{ marginBottom: 16 }}>
          {ROLE_FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`segment${roleFilter === value ? " active" : ""}`}
              onClick={() => setRoleFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
```

- [ ] **Step 2: AdminsPage's NewUserModal role toggle**

In the same file, replace:

```jsx
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["evaluator", "Evaluator"],
              ["admin", "Admin"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: role === value ? "var(--brand-navy)" : "white",
                  color: role === value ? "white" : "var(--text)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>
```

with:

```jsx
          <div className="segmented">
            {[
              ["evaluator", "Evaluator"],
              ["admin", "Admin"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`segment${role === value ? " active" : ""}`}
                onClick={() => setRole(value)}
              >
                {label}
              </button>
            ))}
          </div>
```

- [ ] **Step 3: TemplatesAdminPage draft/published toggle**

In `web/src/pages/TemplatesAdminPage.jsx`, replace:

```jsx
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[
                  ["draft", "Draft"],
                  ["published", "Published"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatus(template, value)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      fontSize: 13,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: status === value ? "var(--brand-navy)" : "white",
                      color: status === value ? "white" : "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
```

with:

```jsx
              <div className="segmented" style={{ marginTop: 10 }}>
                {[
                  ["draft", "Draft"],
                  ["published", "Published"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`segment${status === value ? " active" : ""}`}
                    onClick={() => setStatus(template, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
```

- [ ] **Step 4: TemplateEditorPage line-type picker**

In `web/src/pages/TemplateEditorPage.jsx`, replace:

```jsx
          <div style={{ display: "flex", gap: 6 }}>
            {Object.values(LINE_TYPES).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setLineType(type)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: lineType === type ? "var(--brand-navy)" : "white",
                  color: lineType === type ? "white" : "var(--text)",
                  cursor: "pointer",
                }}
              >
                {LINE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
```

with:

```jsx
          <div className="segmented">
            {Object.values(LINE_TYPES).map((type) => (
              <button
                key={type}
                type="button"
                className={`segment${lineType === type ? " active" : ""}`}
                onClick={() => setLineType(type)}
              >
                {LINE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
```

- [ ] **Step 5: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 6: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load `/admins` (role filter + Add User modal's role toggle), `/templates` (draft/published toggle on a template card), and a template editor page (`/templates/:id`, Add Step's line-type picker). Confirm each toggle still switches correctly and the active option shows the navy fill with the new subtle shadow.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/AdminsPage.jsx web/src/pages/TemplatesAdminPage.jsx web/src/pages/TemplateEditorPage.jsx
git commit -m "Replace duplicated inline pill-toggle markup with a shared segmented-control class"
```

---

## Task 10: AdminsPage remaining styling

**Files:**
- Modify: `web/src/pages/AdminsPage.jsx`

**Interfaces:**
- Consumes: `.card` elevation, `.badge` treatment (Task 1, applied automatically to the user cards and role badges — no change needed for those).

- [ ] **Step 1: Bold the user's display name**

Replace:

```jsx
              <div style={{ fontWeight: 600 }}>
                {user.displayName}{" "}
                <span className={`badge ${role === "admin" ? "pass" : "neutral"}`}>{ROLE_LABELS[role]}</span>
              </div>
```

with:

```jsx
              <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>
                {user.displayName}{" "}
                <span className={`badge ${role === "admin" ? "pass" : "neutral"}`}>{ROLE_LABELS[role]}</span>
              </div>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load `/admins` and confirm each user card shows the elevated card shadow, a bold navy display name, and the uppercase role badge.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/AdminsPage.jsx
git commit -m "Apply Bold Command styling to the Users admin screen"
```

---

## Task 11: RecruitsAdminPage

**Files:**
- Modify: `web/src/pages/RecruitsAdminPage.jsx`

**Interfaces:**
- Consumes: `.card`/`.list-row`/`button.primary` (Task 1, applied automatically).

- [ ] **Step 1: Bold the recruit's name in the list row**

Replace:

```jsx
              <div style={{ flex: 1 }} onClick={() => setEditing(recruit)}>
                <div style={{ fontWeight: 600 }}>{recruit.firstName} {recruit.lastName}</div>
```

with:

```jsx
              <div style={{ flex: 1 }} onClick={() => setEditing(recruit)}>
                <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{recruit.firstName} {recruit.lastName}</div>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load `/recruits` and confirm recruit names are bold navy, then open the Add/Edit Recruit modal to confirm it still opens and saves correctly (this task doesn't change the modal, but it's the same file).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/RecruitsAdminPage.jsx
git commit -m "Apply Bold Command styling to the Recruits admin screen"
```

---

## Task 12: TemplatesAdminPage and TemplateEditorPage remaining styling

**Files:**
- Modify: `web/src/pages/TemplatesAdminPage.jsx`
- Modify: `web/src/pages/TemplateEditorPage.jsx`

**Interfaces:**
- Consumes: `.card`/`.list-row`/`.badge`/`.segmented` (Tasks 1 and 9, applied automatically).

- [ ] **Step 1: Bold the template name on TemplatesAdminPage**

In `web/src/pages/TemplatesAdminPage.jsx`, replace:

```jsx
                <div style={{ flex: 1 }} onClick={() => navigate(`/templates/${template.id}`)}>
                  <div style={{ fontWeight: 600 }}>
                    {template.name}{" "}
                    <span className={`badge ${status === "published" ? "pass" : "neutral"}`}>
                      {status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
```

with:

```jsx
                <div style={{ flex: 1 }} onClick={() => navigate(`/templates/${template.id}`)}>
                  <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>
                    {template.name}{" "}
                    <span className={`badge ${status === "published" ? "pass" : "neutral"}`}>
                      {status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
```

- [ ] **Step 2: Bold the passing-score summary on TemplateEditorPage**

In `web/src/pages/TemplateEditorPage.jsx`, replace:

```jsx
              <span>%</span>
              <span className="muted">
                = {pointsNeededToPass} of <strong>{totalPointsPossible}</strong> total points
              </span>
```

with:

```jsx
              <span>%</span>
              <span className="muted">
                = <strong style={{ color: "var(--brand-navy)" }}>{pointsNeededToPass}</strong> of{" "}
                <strong style={{ color: "var(--brand-navy)" }}>{totalPointsPossible}</strong> total points
              </span>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load `/templates` and a template's editor page, confirming the template name is bold navy on the list and the passing-score numbers stand out on the editor.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/TemplatesAdminPage.jsx web/src/pages/TemplateEditorPage.jsx
git commit -m "Apply Bold Command styling to the Templates admin and editor screens"
```

---

## Task 13: SetupAdminPage placement check (no-op verification task)

This app's `/setup` screen was already updated for the heading color in Task 3 (grouped there because it shares LoginPage's exact layout). This task exists only to confirm, at the admin-phase checkpoint, that `/setup` matches the rest of the admin/auth styling — no code changes.

**Files:**
- None (verification only).

- [ ] **Step 1: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill against a fresh/emulated project with no admin account yet, load `/setup`, and confirm the welcome heading reads in navy bold, matching Login.

- [ ] **Step 2: No commit needed** (nothing changed in this task).

---

## Task 14: Simple reporting list screens

**Files:**
- Modify: `web/src/pages/reporting/ReportingHomePage.jsx`
- Modify: `web/src/pages/reporting/TemplateReportListPage.jsx`
- Modify: `web/src/pages/reporting/RecruitHistoryListPage.jsx`
- Modify: `web/src/pages/reporting/CohortDashboardListPage.jsx`

**Interfaces:**
- Consumes: `.list-row` (Task 1, applied automatically). These four pages are simple `.list-row` menus/directories with no other bespoke styling, so no JSX changes are needed beyond one heading bold on the recruit history list (the only one with secondary detail text worth emphasizing).

- [ ] **Step 1: Bold the recruit name on RecruitHistoryListPage**

In `web/src/pages/reporting/RecruitHistoryListPage.jsx`, replace:

```jsx
              <div>
                <div style={{ fontWeight: 600 }}>{recruit.firstName} {recruit.lastName}</div>
```

with:

```jsx
              <div>
                <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{recruit.firstName} {recruit.lastName}</div>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load `/reports`, `/reports/templates`, `/reports/recruits`, and `/reports/cohorts`. Confirm all four inherit the elevated `.list-row`/top-bar look with no regressions, and the recruit name on the history list is bold navy.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/reporting/ReportingHomePage.jsx web/src/pages/reporting/TemplateReportListPage.jsx web/src/pages/reporting/RecruitHistoryListPage.jsx web/src/pages/reporting/CohortDashboardListPage.jsx
git commit -m "Apply Bold Command styling to the simple reporting list screens"
```

---

## Task 15: Recruit and session detail reporting screens

**Files:**
- Modify: `web/src/pages/reporting/RecruitHistoryDetailPage.jsx`
- Modify: `web/src/pages/reporting/SessionDetailPage.jsx`

**Interfaces:**
- Consumes: `.card--pass`, `.card--fail` (Task 1).

- [ ] **Step 1: Bold the recruit's name on RecruitHistoryDetailPage**

In `web/src/pages/reporting/RecruitHistoryDetailPage.jsx`, replace:

```jsx
          <div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>{recruit.firstName} {recruit.lastName}</div>
```

with:

```jsx
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--brand-navy)" }}>{recruit.firstName} {recruit.lastName}</div>
```

- [ ] **Step 2: Give the SessionDetailPage verdict card the same status-colored left bar used on ResultsPage**

In `web/src/pages/reporting/SessionDetailPage.jsx`, replace:

```jsx
        <div className="card center-column">
          <h2 style={{ margin: "0 0 4px", color: session.overallResult === "pass" ? "var(--success)" : "var(--brand-red)" }}>
```

with:

```jsx
        <div className={`card center-column ${session.overallResult === "pass" ? "card--pass" : "card--fail"}`}>
          <h2 style={{ margin: "0 0 4px", color: session.overallResult === "pass" ? "var(--success)" : "var(--brand-red)" }}>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load a recruit's history detail (`/reports/recruits/:id`) and a completed session's detail (`/reports/sessions/:id`) for both a pass and a fail. Confirm the recruit name is bold navy and the session verdict card shows the matching colored left bar.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/reporting/RecruitHistoryDetailPage.jsx web/src/pages/reporting/SessionDetailPage.jsx
git commit -m "Apply Bold Command styling to the recruit/session detail reporting screens"
```

---

## Task 16: Aggregate reporting screens

**Files:**
- Modify: `web/src/pages/reporting/CohortDashboardPage.jsx`
- Modify: `web/src/pages/reporting/TemplateAggregateReportPage.jsx`

**Interfaces:**
- Consumes: `.card` elevation (Task 1, applied automatically to the summary and matrix cards).

- [ ] **Step 1: Bold the recruit name in the CohortDashboardPage training matrix**

Replace:

```jsx
              <div key={recruit.id} className="card">
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{recruit.firstName} {recruit.lastName}</div>
```

with:

```jsx
              <div key={recruit.id} className="card">
                <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--brand-navy)" }}>{recruit.firstName} {recruit.lastName}</div>
```

- [ ] **Step 2: Bold the sessions/pass-rate summary labels on TemplateAggregateReportPage**

Replace:

```jsx
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Sessions</span><strong>{sessionCount}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Overall Pass Rate</span>
            <strong>{passRate == null ? "—" : `${Math.round(passRate * 100)}%`}</strong>
          </div>
        </div>
```

with:

```jsx
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Sessions</span><strong style={{ color: "var(--brand-navy)" }}>{sessionCount}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Overall Pass Rate</span>
            <strong style={{ color: "var(--brand-navy)" }}>{passRate == null ? "—" : `${Math.round(passRate * 100)}%`}</strong>
          </div>
        </div>
```

- [ ] **Step 3: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load a cohort dashboard (`/reports/cohorts/:cohort`) and a template aggregate report (`/reports/templates/:id`). Confirm the summary numbers and recruit names read in bold navy against the now-elevated cards.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/reporting/CohortDashboardPage.jsx web/src/pages/reporting/TemplateAggregateReportPage.jsx
git commit -m "Apply Bold Command styling to the aggregate reporting screens"
```

---

## Task 17: ExportPage

**Files:**
- Modify: `web/src/pages/reporting/ExportPage.jsx`

**Interfaces:**
- Consumes: `button.primary` shadow, form field styles (Task 1, applied automatically — no change needed for those).

- [ ] **Step 1: Bold the session-count summary line so it reads as a clear confirmation before exporting**

Replace:

```jsx
            <p className="muted">{filtered.length} session{filtered.length === 1 ? "" : "s"} will be exported.</p>
```

with:

```jsx
            <p className="muted">
              <strong style={{ color: "var(--brand-navy)" }}>{filtered.length}</strong> session{filtered.length === 1 ? "" : "s"} will be exported.
            </p>
```

- [ ] **Step 2: Verify the build succeeds**

Run: `cd web && npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manually verify**

Use the `GFD-Training-Practicals/web:verify` skill to load `/reports/export`, change the cohort/test filters, and confirm the session count reads in bold navy and the CSV download still works.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/reporting/ExportPage.jsx
git commit -m "Apply Bold Command styling to the Export screen"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (tokens) → Task 1. Section 2 (components: TopBar, cards, buttons, badges, list rows) → Tasks 1–2 (list rows needed no direct change, confirmed inherited via `.card.list-row`). Section 3 (rollout order: foundation → field-facing → admin → reporting) → Tasks 1–2, 3–8, 9–13, 14–17 respectively, covering all 23 files the spec's grep identified. Section 4 (manual verification, no new tooling) → reflected in Global Constraints and every task's verify step.
- **Placeholder scan:** every step has literal before/after code; no "TBD"/"handle appropriately" text.
- **Type/name consistency:** `.card--pass`/`.card--fail`/`.card--progress`, `.segmented`/`.segment`/`.segment.active`, and the new tokens are defined once in Task 1 and referenced with those exact names in every later task.
- **Scope:** single subsystem (frontend styling), no backend/Firestore/security-rule changes anywhere in this plan.
