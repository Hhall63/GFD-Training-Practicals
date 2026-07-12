# Batch Grade Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin grade many recruits against one single lightweight skill ("Hose Rolls", "Denver Pack", etc.) back-to-back in one sitting, instead of the normal one-recruit-then-one-full-test flow, while every graded result still flows into the existing reporting/CSV/failure-email pipeline unchanged.

**Architecture:** Batch-grade "tests" are ordinary `templates` docs (flag `isBatchGrade: true`) with exactly one graded line, so every existing reporting query (`TemplateReportListPage`, `reportsData.js`, CSV export, failure-notification email) picks them up for free with zero changes. Two new admin-only pages — a picker (`BatchGradePage`) and a roster grader (`BatchGradeRosterPage`) — create ordinary, already-completed `sessions` + `lineResults` docs using the same document shape `RecruitConfirmPage.jsx`'s `beginTest()` already writes. Three existing template queries (`HomePage`, `TemplatesAdminPage`, and — after verification — `TestGroupsAdminPage`) must not surface these lightweight templates as pickable/editable normal tests.

**Tech Stack:** React 18 + react-router-dom 6, Firebase JS SDK v10 (Firestore + Auth), Vite. No unit-test framework is installed in this repo (`web/package.json` has no vitest/jest and no `test` script) — verification in this plan uses `npm run build` for compile-safety and the repo's own `GFD-Training-Practicals/web:verify` skill (Firestore/Auth emulators + Playwright) for real end-to-end UI flows, in place of a unit-test TDD cycle.

## Global Constraints

- Batch-grade templates: `{ name, isActive: true, isBatchGrade: true, createdAt, passingPercentage: 100 }`, no `status` field.
- Batch-grade template's single line: `{ lineType: "graded", lineText: <template name>, points: 1, isCritical: false, sortOrder: 0 }`.
- The 17 seed skill names, verbatim, in this order: "Hose Rolls", "Hose Carries", "Denver Pack", "Loading the Minuteman", "Operate a Water Can", "Operate an ABC Extinguisher", "4x4 Ventilation Opening on a Prop from a Roof Ladder Chainsaw", "4x4 Ventilation Opening on a Walkable Pitch Roof with a Chainsaw", "Operate Rotary Saw with Chopper Blade on a Flat Roof", "Stops Flowing Sprinkler with Wooden Wedges", "Catches Hydrant, Connects to FDC, Pumps Standpipe", "Performs Interior Engineer Standpipe Functions", "Performing Accordion Fold and Roll", "Constructs a Water Chute", "Constructs a Catch-All", "Uses a Diffuser on a Hydrant", "Catches and Dresses a Hydrant", "Setting Up a Drop Tank Drafting Operation".
- Entire feature is admin-only (route-gated the same way every other `/recruits`, `/templates`, `/test-groups` admin route already is: `<RequireAuth><RequireAdminRole>...</RequireAdminRole></RequireAuth>`).
- No `firestore.rules` changes: `templates`/`sessions` write rules already require `isAdminRole()`/`isStaff()` respectively, and every write this feature makes happens from an admin-authenticated session.
- Reuses existing conventions verbatim: `card`/`card--raised`, `primary`/`secondary` buttons, `field` wrapper divs, `badge pass`/`badge fail`/`badge neutral`, the `rgba(0,0,0,0.4)` fixed-overlay modal pattern used throughout `TemplatesAdminPage.jsx`/`RecruitsAdminPage.jsx`/`LiveTestRunnerPage.jsx`.

---

## File Structure

- `web/src/lib/batchGrade.js` **(new)** — `BATCH_GRADE_SEED_NAMES`, `ensureBatchGradeSeedTemplates()`, `createBatchGradeTemplate(name)`, `recordBatchGradeResult({ template, recruit, evaluatorName, result, note, photoURLs })`. All Firestore-touching batch-grade logic lives here so both new pages call the same functions instead of duplicating session-shape code.
- `web/src/pages/BatchGradePage.jsx` **(new)** — the dropdown + "Add New" + "Start Grading" screen.
- `web/src/pages/BatchGradeRosterPage.jsx` **(new)** — the roster grid + fail-note popup.
- `web/src/pages/AdminDashboardPage.jsx` **(modify)** — new "Batch Grade" tile.
- `web/src/lib/navItems.js` **(modify)** — add the tile's `[label, path]` entry.
- `web/src/App.jsx` **(modify)** — two new admin-only routes.
- `web/src/pages/HomePage.jsx`, `web/src/pages/TemplatesAdminPage.jsx` **(modify)** — exclude `isBatchGrade` templates.
- `web/src/pages/TestGroupsAdminPage.jsx` — verification only, no code change expected (see Task 6).

---

### Task 1: Batch-grade data helpers (`web/src/lib/batchGrade.js`)

**Files:**
- Create: `web/src/lib/batchGrade.js`

**Interfaces:**
- Consumes: `db` from `../firebase`; `collection`, `doc`, `addDoc`, `getDocs`, `query`, `where`, `writeBatch`, `serverTimestamp` from `firebase/firestore`; `LINE_TYPES`, `RESULT`, `SESSION_STATUS` from `./constants`; `sendFailureEmail` from `./notify`.
- Produces:
  - `BATCH_GRADE_SEED_NAMES: string[]` — the 17 names, used by Task 4's seed call and available for a future admin reference.
  - `async function ensureBatchGradeSeedTemplates(): Promise<void>` — idempotent; no-op if any `isBatchGrade` template already exists.
  - `async function createBatchGradeTemplate(name: string): Promise<{ id: string, name: string }>` — creates one template + its single line, returns the new template.
  - `async function recordBatchGradeResult({ template, recruit, evaluatorName, result, note, photoURLs }): Promise<{ sessionId: string, failureEmailStatus: string|null }>` — creates a completed `sessions` doc + one `lineResults` doc for this recruit/template pair, sends the failure email on FAIL, returns the new session id.

This task has no separate UI to click through, so its own verification is a Node-free manual Firestore check via the emulator's REST API (below) rather than a Playwright flow — Task 4/5 exercise this module through real UI clicks.

- [ ] **Step 1: Write `BATCH_GRADE_SEED_NAMES` and `createBatchGradeTemplate`**

```javascript
// web/src/lib/batchGrade.js
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { LINE_TYPES, RESULT, SESSION_STATUS } from "./constants";
import { sendFailureEmail } from "./notify";

/**
 * Batch Grade tests are lightweight: a name plus a single graded pass/fail line, never built
 * through TemplateEditorPage and never shown in Manage Tests. They ride the existing
 * templates/sessions pipeline (isBatchGrade: true) so every reporting page picks them up
 * with zero changes — see docs/superpowers/specs/2026-07-12-batch-grade-feature-design.md.
 */
export const BATCH_GRADE_SEED_NAMES = [
  "Hose Rolls",
  "Hose Carries",
  "Denver Pack",
  "Loading the Minuteman",
  "Operate a Water Can",
  "Operate an ABC Extinguisher",
  "4x4 Ventilation Opening on a Prop from a Roof Ladder Chainsaw",
  "4x4 Ventilation Opening on a Walkable Pitch Roof with a Chainsaw",
  "Operate Rotary Saw with Chopper Blade on a Flat Roof",
  "Stops Flowing Sprinkler with Wooden Wedges",
  "Catches Hydrant, Connects to FDC, Pumps Standpipe",
  "Performs Interior Engineer Standpipe Functions",
  "Performing Accordion Fold and Roll",
  "Constructs a Water Chute",
  "Constructs a Catch-All",
  "Uses a Diffuser on a Hydrant",
  "Catches and Dresses a Hydrant",
  "Setting Up a Drop Tank Drafting Operation",
];

async function createBatchGradeTemplateDoc(name) {
  const now = new Date();
  const templateRef = await addDoc(collection(db, "templates"), {
    name,
    isActive: true,
    isBatchGrade: true,
    passingPercentage: 100,
    createdAt: now,
  });
  await addDoc(collection(db, "templates", templateRef.id, "lines"), {
    lineType: LINE_TYPES.GRADED,
    lineText: name,
    points: 1,
    isCritical: false,
    sortOrder: 0,
  });
  return { id: templateRef.id, name };
}

/** Public "Add New" entry point — one template, called from BatchGradePage. */
export async function createBatchGradeTemplate(name) {
  return createBatchGradeTemplateDoc(name);
}
```

- [ ] **Step 2: Write `ensureBatchGradeSeedTemplates`**

Append to the same file. This mirrors the existing idempotent-seed convention already used by `ensurePracticeRecruit()` in `web/src/lib/practiceRecruit.js` (merge/no-op on repeat calls) rather than a one-off external script — this codebase has no Node/admin-SDK execution path for a standalone seed script (no service account, no `firebase-admin` dependency), and an auto-seed-on-first-visit is both simpler and idiomatic here.

```javascript
/**
 * Seeds the 17 default Batch Grade templates the first time anyone opens BatchGradePage.
 * Idempotent by existence check (not per-name upsert): if even one isBatchGrade template
 * already exists, this is a no-op, so it's safe to call on every mount.
 */
export async function ensureBatchGradeSeedTemplates() {
  const existing = await getDocs(
    query(collection(db, "templates"), where("isBatchGrade", "==", true))
  );
  if (!existing.empty) return;

  for (const name of BATCH_GRADE_SEED_NAMES) {
    await createBatchGradeTemplateDoc(name);
  }
}
```

- [ ] **Step 3: Write `recordBatchGradeResult`**

Append to the same file. This mirrors `RecruitConfirmPage.jsx`'s `beginTest()` session/lineResults shape and `LiveTestRunnerPage.jsx`'s `finishSession()` failure-email call, but writes the session already `COMPLETED` since batch grading has no live run.

```javascript
/**
 * Grades one recruit against one Batch Grade template in a single write: creates an
 * already-completed session + its one lineResult, exactly like a normal finished test, so
 * reporting, CSV export, and failure-notification email all treat it identically to any
 * other test (docs/superpowers/specs/2026-07-12-batch-grade-feature-design.md).
 */
export async function recordBatchGradeResult({ template, recruit, evaluatorName, result, note, photoURLs }) {
  const pointsEarned = result === RESULT.PASS ? 1 : 0;
  const criticalFailure = false; // the single line is never marked critical

  const sessionData = {
    recruitId: recruit.id,
    recruitName: `${recruit.firstName} ${recruit.lastName}`,
    templateId: template.id,
    templateName: template.name,
    evaluatorName,
    attemptType: "first",
    startedAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    status: SESSION_STATUS.COMPLETED,
    overallResult: result,
    criticalFailure,
    passingPercentageSnapshot: 100,
    totalPointsPossible: 1,
    totalPointsEarned: pointsEarned,
    failureEmailStatus: null,
    failureEmailRecipients: [],
    failureEmailError: null,
    ...(recruit.isPractice ? { isPractice: true } : {}),
  };

  const sessionRef = await addDoc(collection(db, "sessions"), sessionData);

  const lineResult = {
    sortOrder: 0,
    lineTypeSnapshot: LINE_TYPES.GRADED,
    lineTextSnapshot: template.name,
    passThresholdSecondsSnapshot: null,
    pointsSnapshot: 1,
    isCriticalSnapshot: false,
    obstacleCourseConfigSnapshot: null,
    obstacleTallies: null,
    result,
    pointsEarned,
    timerElapsedSeconds: null,
    note: note || null,
    photoURLs: photoURLs ?? [],
  };
  await addDoc(collection(db, "sessions", sessionRef.id, "lineResults"), lineResult);

  let failureEmail = { status: null, recipients: [], error: null };
  if (result === RESULT.FAIL) {
    failureEmail = await sendFailureEmail(
      { ...sessionData, id: sessionRef.id },
      [lineResult]
    );
    await updateDoc(doc(db, "sessions", sessionRef.id), {
      failureEmailStatus: failureEmail.status,
      failureEmailRecipients: failureEmail.recipients,
      failureEmailError: failureEmail.error,
    });
  }

  return { sessionId: sessionRef.id, failureEmailStatus: failureEmail.status };
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors (this file isn't imported anywhere yet, so a successful build only confirms syntax/import correctness — Task 4/5 exercise the real behavior).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/batchGrade.js
git commit -m "feat: add batch-grade data helpers (seed, create, record result)"
```

---

### Task 2: Admin Dashboard button

**Files:**
- Modify: `web/src/lib/navItems.js`
- Modify: `web/src/pages/AdminDashboardPage.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a `"Batch Grade"` entry pointing at `/batch-grade`, rendered by the existing `adminTiles.map(...)` loop in `AdminDashboardPage.jsx` — Task 3 makes that route resolve.

- [ ] **Step 1: Add the nav item**

`web/src/lib/navItems.js` — full file after the change:

```javascript
export function getAdminNavItems() {
  return [
    ["Manage Recruits", "/recruits"],
    ["Manage Tests", "/templates"],
    ["Manage Test Groups", "/test-groups"],
    ["Batch Grade", "/batch-grade"],
    ["Reports", "/reports"],
    ["Add User", "/admins?new=1"],
    ["See All Users", "/admins"],
  ];
}
```

- [ ] **Step 2: Give the tile an icon**

`web/src/pages/AdminDashboardPage.jsx` — add a case to the `Icon` function (after the existing `"groups"` case, before `"reports"`) and a mapping entry. A clipboard-check glyph fits "grading" and stays consistent with the existing stroke-icon set:

```javascript
    case "batchGrade":
      return (
        <svg {...stroke}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 3h6v2a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V3z" />
          <path d="M9 13l2 2 4-4" />
        </svg>
      );
```

Then add `"/batch-grade": "batchGrade",` to the `ICON_BY_PATH` object.

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds. (The tile will render but its click target `/batch-grade` 404s to the app's catch-all redirect until Task 3 lands — that's expected and fine at this point in the plan.)

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/navItems.js web/src/pages/AdminDashboardPage.jsx
git commit -m "feat: add Batch Grade tile to admin dashboard"
```

---

### Task 3: Routes

**Files:**
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `BatchGradePage` (Task 4), `BatchGradeRosterPage` (Task 5) — both created as empty-but-exporting placeholder components in this task so the app builds, then filled in by Tasks 4/5. (Doing the route wiring first means Task 4/5 each land as a working, clickable screen the moment they're written, rather than needing App.jsx touched again.)

- [ ] **Step 1: Create minimal placeholder pages so imports resolve**

`web/src/pages/BatchGradePage.jsx`:

```javascript
export default function BatchGradePage() {
  return null;
}
```

`web/src/pages/BatchGradeRosterPage.jsx`:

```javascript
export default function BatchGradeRosterPage() {
  return null;
}
```

- [ ] **Step 2: Add imports and routes to `App.jsx`**

Add near the other page imports (after `TestGroupsAdminPage`):

```javascript
import BatchGradePage from "./pages/BatchGradePage";
import BatchGradeRosterPage from "./pages/BatchGradeRosterPage";
```

Add near the other `RequireAdminRole`-wrapped routes (after the `/test-groups` route):

```javascript
      <Route path="/batch-grade" element={<RequireAuth><RequireAdminRole><BatchGradePage /></RequireAdminRole></RequireAuth>} />
      <Route path="/batch-grade/:templateId" element={<RequireAuth><RequireAdminRole><BatchGradeRosterPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/App.jsx web/src/pages/BatchGradePage.jsx web/src/pages/BatchGradeRosterPage.jsx
git commit -m "feat: wire up Batch Grade routes"
```

---

### Task 4: `BatchGradePage.jsx` — dropdown, add-new, start grading

**Files:**
- Modify: `web/src/pages/BatchGradePage.jsx` (replace the Task 3 placeholder)

**Interfaces:**
- Consumes: `ensureBatchGradeSeedTemplates`, `createBatchGradeTemplate` from `../lib/batchGrade` (Task 1); `TopBar` from `../components/TopBar`.
- Produces: navigates to `/batch-grade/:templateId` (Task 5 consumes `templateId` via `useParams`).

- [ ] **Step 1: Write the full page**

```javascript
// web/src/pages/BatchGradePage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import { ensureBatchGradeSeedTemplates, createBatchGradeTemplate } from "../lib/batchGrade";

export default function BatchGradePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAddNew, setShowAddNew] = useState(false);

  useEffect(() => {
    ensureBatchGradeSeedTemplates();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isBatchGrade", "==", true),
      where("isActive", "==", true)
    );
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar title="Batch Grade" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <p className="muted">
          Grade every active recruit against one skill in one sitting, instead of running a
          full test per recruit.
        </p>

        <div className="field">
          <label>Test</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select a test…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <button className="secondary" style={{ marginBottom: 16 }} onClick={() => setShowAddNew(true)}>
          + Add New
        </button>

        <button
          className="primary"
          disabled={!selectedId}
          onClick={() => navigate(`/batch-grade/${selectedId}`)}
        >
          Start Grading
        </button>
      </div>

      {showAddNew && (
        <AddNewBatchTestModal
          onClose={() => setShowAddNew(false)}
          onCreated={(id) => {
            setShowAddNew(false);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function AddNewBatchTestModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const created = await createBatchGradeTemplate(name.trim());
      onCreated(created.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 320, background: "white" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add Batch Grade Test</h3>
        <div className="field">
          <input
            type="text"
            placeholder="Skill Name (e.g. Ladder Raise)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!name.trim() || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify the seed + dropdown + add-new flow against the emulator**

Follow the `GFD-Training-Practicals/web:verify` skill's emulator harness (start `firebase emulators:start --only auth,firestore --project gfd-recruit-training`, then `VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort`, seed the admin user + `meta/appState` doc exactly as the skill documents). Drive with Playwright at a 390x844 viewport:

1. Log in as the seeded admin, land on the Admin Dashboard, click the **Batch Grade** tile → lands on `/batch-grade`.
2. Confirm the dropdown lists all 17 seed names in alphabetical order (the `ensureBatchGradeSeedTemplates()` call seeds them on this first mount).
3. Query Firestore directly to confirm exactly 17 `templates` docs now have `isBatchGrade: true`:
   `curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/templates" | grep -c '"isBatchGrade"'` → expect `17`.
4. Reload the page (remount) — confirm the dropdown still shows exactly 17 entries (proves the idempotent no-op path, not 34).
5. Click **+ Add New**, scoped to `.card:has(h3)` per the verify skill's modal-selector guidance, type "Test Skill X", click **Create** → modal closes, dropdown now shows 18 entries with "Test Skill X" selected.
6. Click **Start Grading** → URL becomes `/batch-grade/<newTemplateId>` (Task 5 will render this; a blank page at this point in the plan is expected since `BatchGradeRosterPage` is still the Task 3 placeholder).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/BatchGradePage.jsx
git commit -m "feat: build BatchGradePage (seed, dropdown, add-new, start grading)"
```

---

### Task 5: `BatchGradeRosterPage.jsx` — roster grid + fail-note popup

**Files:**
- Modify: `web/src/pages/BatchGradeRosterPage.jsx` (replace the Task 3 placeholder)

**Interfaces:**
- Consumes: `recordBatchGradeResult` from `../lib/batchGrade` (Task 1); `PRACTICE_RECRUIT_ID` from `../lib/practiceRecruit`; `compressImageToDataUrl` from `../lib/image`; `initials` from `../lib/constants`; `useAuth` from `../context/AuthContext` (for `adminDoc.displayName` as `evaluatorName`).
- Produces: nothing consumed by later tasks — this is the last new screen.

- [ ] **Step 1: Write the full page**

```javascript
// web/src/pages/BatchGradeRosterPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { initials, RESULT } from "../lib/constants";
import { compressImageToDataUrl } from "../lib/image";
import { PRACTICE_RECRUIT_ID } from "../lib/practiceRecruit";
import { recordBatchGradeResult } from "../lib/batchGrade";

export default function BatchGradeRosterPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { adminDoc } = useAuth();
  const [template, setTemplate] = useState(null);
  const [recruits, setRecruits] = useState([]);
  const [gradedByRecruitId, setGradedByRecruitId] = useState({}); // recruitId -> "pass" | "fail"
  const [failTarget, setFailTarget] = useState(null); // recruit currently being fail-noted, or null
  const [savingRecruitId, setSavingRecruitId] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "templates", templateId)).then((snap) => {
      if (snap.exists()) setTemplate({ id: snap.id, ...snap.data() });
    });
  }, [templateId]);

  useEffect(() => {
    const q = query(collection(db, "recruits"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setRecruits(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => !r.isPractice && r.id !== PRACTICE_RECRUIT_ID)
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, []);

  async function gradePass(recruit) {
    setSavingRecruitId(recruit.id);
    try {
      await recordBatchGradeResult({
        template,
        recruit,
        evaluatorName: adminDoc.displayName,
        result: RESULT.PASS,
        note: null,
        photoURLs: [],
      });
      setGradedByRecruitId((prev) => ({ ...prev, [recruit.id]: RESULT.PASS }));
    } finally {
      setSavingRecruitId(null);
    }
  }

  async function confirmFail(recruit, note, photoURLs) {
    setSavingRecruitId(recruit.id);
    try {
      await recordBatchGradeResult({
        template,
        recruit,
        evaluatorName: adminDoc.displayName,
        result: RESULT.FAIL,
        note,
        photoURLs,
      });
      setGradedByRecruitId((prev) => ({ ...prev, [recruit.id]: RESULT.FAIL }));
      setFailTarget(null);
    } finally {
      setSavingRecruitId(null);
    }
  }

  if (!template) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="app-shell">
      <TopBar title={template.name} onBack={() => navigate("/batch-grade")} showMenu={false} />
      <div className="screen--wide">
        {recruits.length === 0 && <p className="muted">No active recruits to grade.</p>}
        <div className="recruit-grid">
          {recruits.map((recruit) => {
            const graded = gradedByRecruitId[recruit.id];
            const isSaving = savingRecruitId === recruit.id;
            return (
              <div key={recruit.id} className="card card--raised">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {recruit.photoURL ? (
                    <img src={recruit.photoURL} className="avatar" alt="" />
                  ) : (
                    <div className="avatar">{initials(recruit.firstName, recruit.lastName)}</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {recruit.firstName} {recruit.lastName}
                    </div>
                    <div className="muted">{recruit.recruitClassOrCohort}</div>
                  </div>
                </div>

                {graded ? (
                  <span
                    className={`badge ${graded === RESULT.PASS ? "pass" : "fail"}`}
                    style={{ display: "block", textAlign: "center", marginTop: 10 }}
                  >
                    {graded === RESULT.PASS ? "PASS" : "FAIL"}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="primary"
                      style={{ flex: 1 }}
                      disabled={isSaving}
                      onClick={() => gradePass(recruit)}
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      style={{ flex: 1, color: "var(--brand-red)" }}
                      disabled={isSaving}
                      onClick={() => setFailTarget(recruit)}
                    >
                      Fail
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {failTarget && (
        <FailNoteModal
          recruit={failTarget}
          onClose={() => setFailTarget(null)}
          onConfirm={(note, photoURLs) => confirmFail(failTarget, note, photoURLs)}
        />
      )}
    </div>
  );
}

function FailNoteModal({ recruit, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  const [photoURLs, setPhotoURLs] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file);
    setPhotoURLs((prev) => [...prev, dataUrl]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onConfirm(note.trim(), photoURLs);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ maxWidth: 340, padding: 24, textAlign: "left" }}>
        <h3 style={{ marginBottom: 8 }}>Note Required</h3>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {recruit.firstName} {recruit.lastName} failed. Add a note explaining what happened
          before submitting.
        </p>
        <textarea
          autoFocus
          rows={3}
          placeholder="What did the recruit fail on?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%" }}
        />
        <div className="field" style={{ marginTop: 10 }}>
          <label>Photo (optional)</label>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button className="secondary" style={{ flex: 1 }} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="primary"
            style={{ flex: 1 }}
            disabled={!note.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : "Save & Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify the full grading flow against the emulator**

Continuing the Task 4 emulator session (or restarting per the verify skill if it was stopped): with at least two active recruits seeded in Firestore (add them via the emulator REST API or through Manage Recruits in the UI), drive with Playwright:

1. From `BatchGradePage`, pick a seeded test (e.g. "Hose Rolls") and click **Start Grading**.
2. Confirm the roster grid lists every active, non-practice recruit with a Pass/Fail button pair.
3. Click **Pass** on the first recruit → button pair is replaced by a `PASS` badge with no popup.
4. Click **Fail** on the second recruit → the note modal opens (scope all fills to `.card:has(h3)` per the verify skill). Try clicking **Save & Submit** with an empty note first → confirm it stays disabled. Type a note, click **Save & Submit** → modal closes, that recruit now shows a `FAIL` badge.
5. Query Firestore to confirm two `sessions` docs were created for `templateId == <the graded template's id>`, one with `overallResult: "pass"`, one with `overallResult: "fail"` and a non-empty `note` in its one `lineResults` doc:
   `curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions" | grep -A3 '"templateId"'`
6. Navigate to Reports → Test Pass Rates (`/reports/templates`) and confirm the graded test's name appears in the list (proves #4e — batch-grade results surface in Reports with zero extra code, per Task 1-5's design).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/BatchGradeRosterPage.jsx
git commit -m "feat: build BatchGradeRosterPage (pass/fail grid, fail-note popup)"
```

---

### Task 6: Exclude Batch Grade templates from the normal test pickers

**Files:**
- Modify: `web/src/pages/HomePage.jsx`
- Modify: `web/src/pages/TemplatesAdminPage.jsx`
- Verify only (no expected change): `web/src/pages/TestGroupsAdminPage.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (last task in this plan).

**Note on `TestGroupsAdminPage.jsx`:** its template query is already
`where("isActive","==",true).where("status","==","published")`
(`TestGroupsAdminPage.jsx:24-29`). Firestore equality filters never match a
document that's missing the filtered field, and Batch Grade templates are
created with no `status` field at all (per the Global Constraints), so this
query *already* excludes them with no code change. This plan verifies that
rather than adding a redundant filter that would be dead code — this is a
deliberate, verified deviation from the original spec's assumption that all
three pages needed the same explicit filter.

- [ ] **Step 1: Exclude from `HomePage.jsx`**

In `web/src/pages/HomePage.jsx`, the `templates` `onSnapshot` callback currently reads:

```javascript
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    });
```

Change it to filter out batch-grade templates (they're never a normal
recruit-test pick, admin or not — the `isAdmin` branch above this callback
has no `status` filter, so without this they'd otherwise leak into the
picker for admins):

```javascript
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => !t.isBatchGrade)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    });
```

- [ ] **Step 2: Exclude from `TemplatesAdminPage.jsx`**

In `web/src/pages/TemplatesAdminPage.jsx`, the `templates` `onSnapshot`
callback currently reads:

```javascript
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
```

Change it to:

```javascript
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => !t.isBatchGrade)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify all three exclusions against the emulator**

With the Batch Grade seed already run (from Task 4's verification, so at
least the 17 seed templates plus any normal test templates already in the
emulator's Firestore exist), drive with Playwright:

1. As an admin, open Home (`/start-test` or `/`) → confirm none of the 17
   Batch Grade names (e.g. "Denver Pack") appear in the test picker list,
   only normal templates do.
2. Open Manage Tests (`/templates`) → confirm the same: no Batch Grade
   names in the list.
3. Open Manage Test Groups (`/test-groups`), click **+ New Test Group** →
   confirm the template checklist inside the modal shows no Batch Grade
   names either (this is the pre-existing `status == "published"` filter
   doing the work, per this task's note above — no code was changed for
   this screen, only verified).
4. As a sanity check that the filter is scoped correctly, open
   `/batch-grade` and confirm all 17 (or 18, if Task 4's "Test Skill X" is
   still present from its own verification) Batch Grade names still appear
   there, unaffected by this task's changes.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/HomePage.jsx web/src/pages/TemplatesAdminPage.jsx
git commit -m "fix: exclude batch-grade templates from normal test pickers"
```

---

## Plan Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-12-batch-grade-feature-design.md`):
- #4a dashboard button → Task 2.
- #4b/c/d list/dropdown/add-new → Task 4.
- #4e appear alongside other tests on Reports → satisfied by design (Task 1's data model) and explicitly checked in Task 5 Step 3.6.
- Roster grid, pass/fail, fail-note popup with optional photo → Task 5.
- Lightweight template + single line data model, seed list → Task 1.
- Exclusion from HomePage/TemplatesAdminPage/TestGroupsAdminPage → Task 6 (with the `TestGroupsAdminPage` finding documented rather than papered over).
- No `firestore.rules` change needed → confirmed true: all writes originate from an already-`isAdminRole()` session, matching the existing rules with no new rule needed.

**Placeholder scan:** no TBD/TODO markers; every step has complete, real code; no "similar to Task N" shortcuts — Task 5's session-shape code is fully written out again rather than referenced.

**Type/name consistency check:**
- `recordBatchGradeResult` (Task 1) is called with the same parameter names (`template`, `recruit`, `evaluatorName`, `result`, `note`, `photoURLs`) in both its Task 1 definition and its two Task 5 call sites (`gradePass`, `confirmFail`).
- `createBatchGradeTemplate` (Task 1) return shape `{ id, name }` matches how Task 4's `AddNewBatchTestModal.onCreated(created.id)` consumes it.
- `BATCH_GRADE_SEED_NAMES` is defined once in Task 1 and only read (never redefined) by `ensureBatchGradeSeedTemplates` in the same file — no duplicate list anywhere else in the plan.
- `isBatchGrade` (not `isBatchGraded` or `batchGrade`) is spelled identically everywhere it's read or written: Task 1 (write), Task 4 (query), Task 5 (not read, but no field-name usage to drift), Task 6 (filter reads).
