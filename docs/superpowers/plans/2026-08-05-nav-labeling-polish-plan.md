# Nav / Labeling Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename three admin nav labels, add the two missing dashboard tile icons, and give the admin "Select a Test" screen a way back to the dashboard.

**Architecture:** Three independent, unrelated-but-small edits across five existing files — no new files, no new dependencies, no data model or routing changes. Each edit is a self-contained deliverable matching one numbered section of the design spec.

**Tech Stack:** React (existing components), `react-router-dom` (existing `useLocation` hook, not currently imported in `HomePage.jsx`), Node.js for scratch grep-based verification (no unit-test framework in `web/`, consistent with every other plan in this repo).

## Global Constraints

- Label renames (from `docs/superpowers/specs/2026-08-05-nav-labeling-polish-design.md`): `"Manage Tests"` → `"Manage Practicals"`, `"Manage Exams"` → `"Test Bank"`, `"Enter Exam Scores"` → `"Written Test Gradebook"`. `TemplatesAdminPage.jsx`'s `"Test Templates"` title is a different string and is NOT touched.
- New icons match the existing `Icon` component's established style exactly: 24px, `strokeWidth: 1.75`, `stroke: "currentColor"`, `fill: "none"` (stroke-style icons — the one exception in the file, `"play"`, uses filled `currentColor` instead, but that's not the pattern to copy here).
- The return-to-dashboard button only appears when `HomePage.jsx` is rendered at the `/start-test` path (admins), never at `/` (evaluators' actual home).
- No unit-test framework exists in `web/` — verification uses `grep` against the real source files (these are pure string/markup changes, not logic) plus a full `npm run build`, per this repo's established convention.

---

### Task 1: Rename the three nav labels

**Files:**
- Modify: `web/src/lib/navItems.js` (whole file, currently 13 lines)
- Modify: `web/src/pages/ExamsAdminPage.jsx:56`
- Modify: `web/src/pages/ExamScoresPage.jsx:61`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getAdminNavItems()` — same return shape (`[label, path][]`), only three label strings change. No caller (`TopBar.jsx`, `AdminDashboardPage.jsx`) needs to change: both already render `label` generically.

- [ ] **Step 1: Confirm the current (pre-change) strings, as a baseline**

```bash
cd web && grep -n "Manage Tests\|Manage Exams\|Enter Exam Scores" src/lib/navItems.js src/pages/ExamsAdminPage.jsx src/pages/ExamScoresPage.jsx
```

Expected: three matches — `navItems.js` shows all three old labels; `ExamsAdminPage.jsx:56` shows `title="Manage Exams"`; `ExamScoresPage.jsx:61` shows `title="Enter Exam Scores"`.

- [ ] **Step 2: Modify `web/src/lib/navItems.js`**

Replace the whole file with:

```js
export function getAdminNavItems() {
  return [
    ["Manage Recruits", "/recruits"],
    ["Manage Practicals", "/templates"],
    ["Manage Test Groups", "/test-groups"],
    ["Batch Grade", "/batch-grade"],
    ["Test Bank", "/exams"],
    ["Written Test Gradebook", "/exam-scores"],
    ["Reports", "/reports"],
    ["Add User", "/admins?new=1"],
    ["See All Users", "/admins"],
  ];
}
```

- [ ] **Step 3: Modify `web/src/pages/ExamsAdminPage.jsx:56`**

Change:

```jsx
      <TopBar title="Manage Exams" onBack={() => navigate("/")} showMenu={false} />
```

to:

```jsx
      <TopBar title="Test Bank" onBack={() => navigate("/")} showMenu={false} />
```

- [ ] **Step 4: Modify `web/src/pages/ExamScoresPage.jsx:61`**

Change:

```jsx
      <TopBar title="Enter Exam Scores" onBack={() => navigate("/")} showMenu={false} />
```

to:

```jsx
      <TopBar title="Written Test Gradebook" onBack={() => navigate("/")} showMenu={false} />
```

- [ ] **Step 5: Confirm the rename took and the old strings are gone from these three files**

```bash
cd web && grep -n "Manage Practicals\|Test Bank\|Written Test Gradebook" src/lib/navItems.js src/pages/ExamsAdminPage.jsx src/pages/ExamScoresPage.jsx && ! grep -rn "Manage Tests\"\|title=\"Manage Exams\"\|title=\"Enter Exam Scores\"" src/lib/navItems.js src/pages/ExamsAdminPage.jsx src/pages/ExamScoresPage.jsx
```

Expected: first grep finds the three new strings (one match per file, `navItems.js` shows two — `"Test Bank"` and `"Written Test Gradebook"` — plus `"Manage Practicals"`, three total); second grep (negated) finds nothing, confirming no old label leaked back in.

- [ ] **Step 6: Confirm `TemplatesAdminPage.jsx` was NOT touched**

```bash
cd web && grep -n "Test Templates" src/pages/TemplatesAdminPage.jsx
```

Expected: one match, unchanged — this file's title was never part of the rename.

- [ ] **Step 7: Build clean**

```bash
cd web && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/navItems.js web/src/pages/ExamsAdminPage.jsx web/src/pages/ExamScoresPage.jsx && git commit -m "$(cat <<'EOF'
rename: Manage Tests/Exams/Enter Exam Scores to current terminology

navItems.js is the single source of truth for the dropdown menu and
dashboard grid labels; ExamsAdminPage.jsx and ExamScoresPage.jsx each
separately hardcode a matching page title that needed the same
rename. TemplatesAdminPage.jsx's own "Test Templates" title is a
different string and is untouched.
EOF
)"
```

---

### Task 2: Add the two missing dashboard tile icons

**Files:**
- Modify: `web/src/pages/AdminDashboardPage.jsx:20-104` (the `Icon` component's `switch` and the `ICON_BY_PATH` map)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Icon` now renders a shape for `name="testBank"` and `name="gradebook"`; `ICON_BY_PATH["/exams"]` and `ICON_BY_PATH["/exam-scores"]` now resolve to those names instead of being absent. No other file reads `Icon` or `ICON_BY_PATH` directly — `AdminDashboardPage.jsx` is the only consumer.

- [ ] **Step 1: Confirm the current gap**

```bash
cd web && grep -n '"/exams"\|"/exam-scores"' src/pages/AdminDashboardPage.jsx
```

Expected: no output — neither path has an `ICON_BY_PATH` entry today, so those two dashboard tiles render with `Icon name={undefined}`, which falls through the `switch`'s `default: return null`.

- [ ] **Step 2: Add the two new `Icon` cases**

In `web/src/pages/AdminDashboardPage.jsx`, insert two new `case` blocks into the `switch (name)` inside `Icon`, immediately before the existing `case "chevron":` (currently line 85):

```jsx
    case "testBank":
      return (
        <svg {...stroke}>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case "gradebook":
      return (
        <svg {...stroke}>
          <path d="M12 6.5c-1.5-1-4-1.5-6-1.2v13c2-.3 4.5.2 6 1.2 1.5-1 4-1.5 6-1.2v-13c-2-.3-4.5.2-6 1.2z" />
          <line x1="12" y1="6.5" x2="12" y2="19.5" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...stroke}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
```

(Only the two new cases are additions — `case "chevron"` itself is shown for placement context and its body is unchanged.)

- [ ] **Step 3: Add the two new `ICON_BY_PATH` entries**

Change the `ICON_BY_PATH` object (currently lines 96–104):

```js
const ICON_BY_PATH = {
  "/recruits": "recruits",
  "/templates": "tests",
  "/test-groups": "groups",
  "/batch-grade": "batchGrade",
  "/exams": "testBank",
  "/exam-scores": "gradebook",
  "/reports": "reports",
  "/admins?new=1": "addUser",
  "/admins": "users",
};
```

- [ ] **Step 4: Confirm both new mappings and icon cases are present**

```bash
cd web && grep -n '"/exams": "testBank"\|"/exam-scores": "gradebook"\|case "testBank"\|case "gradebook"' src/pages/AdminDashboardPage.jsx
```

Expected: four matches, one per pattern.

- [ ] **Step 5: Build clean**

```bash
cd web && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/AdminDashboardPage.jsx && git commit -m "$(cat <<'EOF'
feat: add dashboard icons for Test Bank and Written Test Gradebook

Both tiles previously had no ICON_BY_PATH entry and silently
rendered with no icon at all. Adds an archive-box icon for Test Bank
and an open-book icon for Written Test Gradebook, matching the
existing 24px/1.75-stroke line-icon style used by every other tile.
EOF
)"
```

---

### Task 3: Return-to-dashboard button on the Select a Test screen

**Files:**
- Modify: `web/src/pages/HomePage.jsx` (whole file, currently 79 lines)

**Interfaces:**
- Consumes: `TopBar`'s existing `onBack` prop (already supported — `TopBar.jsx` renders a "←" `icon-button` whenever `onBack` is truthy; no change needed there).
- Produces: nothing new for other files — this is the last code task.

- [ ] **Step 1: Confirm the current gap**

```bash
cd web && grep -n "onBack\|useLocation" src/pages/HomePage.jsx
```

Expected: no output — `HomePage.jsx` never passes `onBack` to `<TopBar>` today, so no back arrow ever renders here, regardless of how the page was reached.

- [ ] **Step 2: Modify `web/src/pages/HomePage.jsx`**

Change the import line (currently line 2):

```js
import { useNavigate } from "react-router-dom";
```

to:

```js
import { useNavigate, useLocation } from "react-router-dom";
```

Add a `location` lookup right after the existing `navigate` line (currently line 8):

```js
  const navigate = useNavigate();
  const location = useLocation();
```

Change the `<TopBar />` render (currently line 48):

```jsx
        <TopBar />
```

to:

```jsx
        {/* Admins reach this screen via /start-test from their dashboard and need a way
            back; evaluators land here directly at "/" — it IS their home, so no button. */}
        <TopBar onBack={location.pathname === "/start-test" ? () => navigate("/") : undefined} />
```

- [ ] **Step 3: Confirm the conditional and import are both in place**

```bash
cd web && grep -n "useLocation\|location.pathname === \"/start-test\"" src/pages/HomePage.jsx
```

Expected: three matches — the import, the `location` assignment, and the conditional in the `TopBar` render.

- [ ] **Step 4: Build clean**

```bash
cd web && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/HomePage.jsx && git commit -m "$(cat <<'EOF'
feat: add a return-to-dashboard button on the Select a Test screen

HomePage.jsx now passes onBack to TopBar only when reached via
/start-test (the admin dashboard's "Start a Test" sub-screen),
reusing the same back-arrow affordance every other admin page
already has. Evaluators landing here directly at "/" — their actual
home — see no change.
EOF
)"
```

---

### Task 4: End-to-end browser verification, then push

**Files:** none — verification only, using the app's existing local sandbox harness (per `docs/superpowers/specs/2026-07-28-local-emulator-sandbox-design.md`).

**Interfaces:** none.

- [ ] **Step 1: Build clean one more time from the full set of changes**

```bash
cd web && npm run build
```

Expected: clean build.

- [ ] **Step 2: Drive the actual app in a browser and confirm the full design-spec testing checklist**

Use the project's `web:verify` skill (or manually run `npm run dev:sandbox` with seeded data via `npm run seed:sandbox`) to walk through:
1. Log in as admin → dashboard grid shows "Manage Practicals," "Test Bank," and "Written Test Gradebook" tiles, each with a distinct icon (no blank icon slots).
2. Open the admin `⋯` menu from any admin page → same three renamed labels appear in the dropdown, in the same order as the dashboard grid.
3. Navigate to Test Bank (`/exams`) and Written Test Gradebook (`/exam-scores`) directly → each page's own `TopBar` header now reads the new name too.
4. From the admin dashboard, click "Start a Test" → the Select a Test screen shows a back arrow (top-left, next to the badge) that returns to the dashboard when clicked.
5. Log in as an evaluator (non-admin) → their landing screen (Select a Test, at `/`) shows no back arrow, unchanged from today.

- [ ] **Step 3: Push the branch**

```bash
git push
```

Expected: pushes all commits from Tasks 1–3 to the remote branch.
