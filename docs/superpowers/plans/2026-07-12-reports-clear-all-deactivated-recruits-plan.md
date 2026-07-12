# Reports Clear-All + Deactivated Recruits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded "Clear All Results" bulk-delete to the Reports page, and a Deactivated Recruits page so recruits removed from the active roster (never hard-deleted) are still viewable and reactivatable.

**Architecture:** Both features are pure additions to the existing Firestore-backed React app — no new backend, no new Firestore collections. Clear-All adds one function to `reportsData.js` (batched `sessions` + `lineResults` deletion) plus a confirmation modal on `ReportingHomePage.jsx`. Deactivated Recruits adds one new page mirroring `RecruitsAdminPage.jsx`'s existing query shape with `isActive == false` instead of `true`, plus a Reactivate action (the direct inverse of the existing `deactivate()`).

**Tech Stack:** React 18, react-router-dom 6, Firebase JS SDK v10 (Firestore), Vite. No unit test framework is installed in this repo (`web/package.json` has no test script, no vitest/jest) — verification is `npm run build` (compile safety) plus this project's own emulator + Playwright harness (`web/.claude/skills/verify/SKILL.md`), which seeds Firestore directly via the Firestore emulator's REST API and drives the UI with Playwright.

## Global Constraints

- Every modal in this app uses the same overlay convention: `position: fixed, inset: 0, background: rgba(0,0,0,0.4)`, centered `.card` child, `onClick={(e) => e.stopPropagation()}` on the card to stop the overlay's own `onClick={onClose}` from firing. Match this exactly — Playwright selectors elsewhere rely on `.card:has(h3)` to scope into modals.
- Destructive/danger buttons use `className="secondary"` with `style={{ color: "var(--brand-red)" }}` (see `RecruitsAdminPage.jsx`'s "Deactivate" button) for a non-primary danger action, or `className="primary"` with `style={{ background: "var(--brand-red)" }}` for a primary danger action (the confirm button inside a destructive modal).
- Admin-only pages are wrapped in `<RequireAuth><RequireAdminRole>...</RequireAdminRole></RequireAuth>` in `App.jsx` — the route wrapper is the access gate; components themselves don't need a redundant `isAdmin` check when already behind `RequireAdminRole`.
- The practice recruit (`recruits/practice-recruit`, `isPractice: true`) must never appear in an admin-facing recruit list — always filter it out the same way `RecruitsAdminPage.jsx` does: `.filter((r) => !r.isPractice && r.id !== PRACTICE_RECRUIT_ID)`.
- Firestore's write batch limit is 500 operations per `commit()` — any bulk-delete loop must chunk into multiple batches.

---

### Task 1: `clearAllSessions()` in `reportsData.js`

**Files:**
- Modify: `web/src/lib/reportsData.js`

**Interfaces:**
- Produces: `export async function clearAllSessions(onProgress)` — `onProgress` is an optional `(done: number, total: number) => void` callback invoked after each session (and its `lineResults`) is deleted. Returns `Promise<number>` (total sessions deleted).

- [ ] **Step 1: Add the `writeBatch` import and the function**

Open `web/src/lib/reportsData.js`. Change the import on line 1 from:

```js
import { collection, getDocs, query, where } from "firebase/firestore";
```

to:

```js
import { collection, getDocs, query, where, writeBatch } from "firebase/firestore";
```

Then add this function at the end of the file (after `buildCommandBoard`):

```js
const CLEAR_ALL_BATCH_LIMIT = 500;

/**
 * Deletes every document in `sessions` (and each session's `lineResults` subcollection) —
 * the full test-result history for every recruit, all time. Recruits and templates are
 * untouched. Used by the Reports page's "Clear All Results" action.
 *
 * Firestore batches cap at 500 writes, so this commits in chunks rather than one giant
 * batch. `onProgress`, if given, is called after each session is fully deleted (its
 * lineResults plus the session doc itself) so a confirmation modal can show live progress
 * on a large history.
 */
export async function clearAllSessions(onProgress) {
  const sessionsSnap = await getDocs(collection(db, "sessions"));
  const total = sessionsSnap.docs.length;
  let done = 0;
  let batch = writeBatch(db);
  let opsInBatch = 0;

  async function deleteRef(ref) {
    batch.delete(ref);
    opsInBatch += 1;
    if (opsInBatch >= CLEAR_ALL_BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      opsInBatch = 0;
    }
  }

  for (const sessionDoc of sessionsSnap.docs) {
    const lineResultsSnap = await getDocs(collection(db, "sessions", sessionDoc.id, "lineResults"));
    for (const lineResultDoc of lineResultsSnap.docs) {
      await deleteRef(lineResultDoc.ref);
    }
    await deleteRef(sessionDoc.ref);
    done += 1;
    onProgress?.(done, total);
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  return done;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors (this function isn't called from any UI yet, so this only proves there's no syntax/import error).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/reportsData.js
git commit -m "Add clearAllSessions() batched bulk-delete for Reports Clear All"
```

---

### Task 2: "Clear All Results" button + confirmation modal on `ReportingHomePage.jsx`

**Files:**
- Modify: `web/src/pages/reporting/ReportingHomePage.jsx`

**Interfaces:**
- Consumes: `clearAllSessions(onProgress)` from Task 1 (`web/src/lib/reportsData.js`), `loadCommandBoardData()` (already imported in this file).

- [ ] **Step 1: Add the import and modal component**

In `web/src/pages/reporting/ReportingHomePage.jsx`, change the import on line 4 from:

```js
import { buildCommandBoard, loadCommandBoardData } from "../../lib/reportsData";
```

to:

```js
import { buildCommandBoard, clearAllSessions, loadCommandBoardData } from "../../lib/reportsData";
```

Then add this component after `KpiTile` (after line 22, before `export default function ReportingHomePage()`):

```jsx
function ClearAllResultsModal({ onClose, onCleared }) {
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const canConfirm = confirmText.trim() === "CLEAR" && !clearing;

  async function handleConfirm() {
    setClearing(true);
    await clearAllSessions((done, total) => setProgress({ done, total }));
    await onCleared();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={clearing ? undefined : onClose}
    >
      <div className="card" style={{ width: 340, background: "white" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Clear All Results</h3>
        <p className="muted">
          This permanently deletes all test results for every recruit. Recruits and test
          templates are not affected. This cannot be undone.
        </p>
        {clearing ? (
          <p className="muted">
            Deleting… {progress.done} of {progress.total} sessions
          </p>
        ) : (
          <>
            <div className="field">
              <label>Type CLEAR to confirm</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary"
                style={{ background: "var(--brand-red)" }}
                disabled={!canConfirm}
                onClick={handleConfirm}
              >
                Delete Everything
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add state and the button**

Inside `export default function ReportingHomePage()`, after the existing `const [cohortFilter, setCohortFilter] = useState("All Cohorts");` line, add:

```js
const [showClearModal, setShowClearModal] = useState(false);
```

Then, in the JSX, immediately after the closing `</div>` of `quick-link-grid` (right before the final closing `</div>` of `screen--wide`, i.e. after line 212's `</div>` and before line 213's `</div>`), add:

```jsx
<button
  className="secondary"
  style={{ marginTop: 16, color: "var(--brand-red)" }}
  onClick={() => setShowClearModal(true)}
>
  Clear All Results
</button>

{showClearModal && (
  <ClearAllResultsModal
    onClose={() => setShowClearModal(false)}
    onCleared={async () => {
      const raw = await loadCommandBoardData();
      setData(raw);
      setShowClearModal(false);
    }}
  />
)}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify end-to-end via the emulator harness**

Start the emulator + dev server per `web/.claude/skills/verify/SKILL.md`:

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training &
VITE_USE_EMULATOR=1 npm run dev -- --port 5178 --host 127.0.0.1 --strictPort &
```

Seed an admin login and the two bootstrap docs (exact commands in the SKILL.md — sign up `verify.admin@example.com` / `VerifyBot!2026` via the auth emulator, `PATCH` `admins/$TESTUID` with `role: admin, isActive: true`, and `PATCH` `meta/appState` with `firstAdminCreated: true`).

Seed two sessions directly via the Firestore emulator REST API so there's something to clear:

```bash
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions/verify-session-1" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"recruitId":{"stringValue":"x"},"recruitName":{"stringValue":"Test One"},"templateId":{"stringValue":"t1"},"templateName":{"stringValue":"Test Template"},"status":{"stringValue":"completed"},"overallResult":{"stringValue":"pass"},"isPractice":{"booleanValue":false}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions/verify-session-2" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"recruitId":{"stringValue":"x"},"recruitName":{"stringValue":"Test Two"},"templateId":{"stringValue":"t1"},"templateName":{"stringValue":"Test Template"},"status":{"stringValue":"completed"},"overallResult":{"stringValue":"fail"},"isPractice":{"booleanValue":false}}}'
```

Confirm both exist:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions" -H "Authorization: Bearer owner" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('documents', [])))"
```

Expected output: `2`

Drive the UI with Playwright (390x844 viewport per the SKILL.md): log in as `verify.admin@example.com` / `VerifyBot!2026`, navigate to `/reports`, click "Clear All Results", fill the confirmation input (scoped to `.card:has(h3)`) with `CLEAR`, click "Delete Everything", wait for the "Deleting…" text to disappear.

Re-run the same count check:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions" -H "Authorization: Bearer owner" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('documents', [])))"
```

Expected output: `0`

Reset the emulator afterward per the SKILL.md: `curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/gfd-recruit-training/databases/(default)/documents"`.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/reporting/ReportingHomePage.jsx
git commit -m "Add guarded Clear All Results action to Reports page"
```

---

### Task 3: Deactivated Recruits page

**Files:**
- Create: `web/src/pages/DeactivatedRecruitsPage.jsx`
- Modify: `web/src/App.jsx`
- Modify: `web/src/pages/RecruitsAdminPage.jsx`

**Interfaces:**
- Consumes: `db` from `../firebase`, `PRACTICE_RECRUIT_ID` from `../lib/practiceRecruit`, `initials` from `../lib/constants`, `TopBar` from `../components/TopBar` — all existing exports, unchanged.

- [ ] **Step 1: Create the page**

Create `web/src/pages/DeactivatedRecruitsPage.jsx`:

```jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import { initials } from "../lib/constants";
import { PRACTICE_RECRUIT_ID } from "../lib/practiceRecruit";

export default function DeactivatedRecruitsPage() {
  const navigate = useNavigate();
  const [recruits, setRecruits] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "recruits"), where("isActive", "==", false));
    return onSnapshot(q, (snap) => {
      setRecruits(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => !r.isPractice && r.id !== PRACTICE_RECRUIT_ID)
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, []);

  async function reactivate(recruit) {
    await updateDoc(doc(db, "recruits", recruit.id), { isActive: true });
  }

  return (
    <div className="app-shell">
      <TopBar title="Deactivated Recruits" onBack={() => navigate("/recruits")} showMenu={false} />
      <div className="screen--wide">
        {recruits.length === 0 && <p className="muted">No deactivated recruits.</p>}

        <div className="recruit-grid">
          {recruits.map((recruit) => (
            <div key={recruit.id} className="card card--raised">
              {recruit.photoURL ? (
                <img src={recruit.photoURL} className="avatar" alt="" />
              ) : (
                <div className="avatar">{initials(recruit.firstName, recruit.lastName)}</div>
              )}
              <div className="recruit-tile-name" style={{ fontWeight: 600 }}>
                {recruit.firstName} {recruit.lastName}
              </div>
              <div className="muted recruit-tile-cohort">{recruit.recruitClassOrCohort}</div>
              <button
                type="button"
                className="secondary"
                style={{ width: "100%", marginTop: 10, padding: "12px 12px" }}
                onClick={() => reactivate(recruit)}
              >
                Reactivate
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `web/src/App.jsx`, add the import after line 13 (`import RecruitsAdminPage from "./pages/RecruitsAdminPage";`):

```js
import DeactivatedRecruitsPage from "./pages/DeactivatedRecruitsPage";
```

Then add the route immediately after line 104 (the `/recruits` route):

```jsx
<Route path="/recruits/deactivated" element={<RequireAuth><RequireAdminRole><DeactivatedRecruitsPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Add the link from Manage Recruits**

In `web/src/pages/RecruitsAdminPage.jsx`, add a button right after the search field's closing `</div>` (after line 76, before line 78's `{filtered.length === 0 && ...}`):

```jsx
<button
  type="button"
  className="secondary"
  style={{ width: "auto", padding: "8px 12px", marginBottom: 12 }}
  onClick={() => navigate("/recruits/deactivated")}
>
  View Deactivated
</button>
```

- [ ] **Step 4: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Verify end-to-end via the emulator harness**

With the emulator + dev server still running (or restarted per Task 2 Step 4's commands), seed one active and one deactivated recruit:

```bash
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/recruits/verify-recruit-active" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstName":{"stringValue":"Ann"},"lastName":{"stringValue":"Active"},"recruitClassOrCohort":{"stringValue":"Class A"},"isActive":{"booleanValue":true}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/recruits/verify-recruit-inactive" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"firstName":{"stringValue":"Bob"},"lastName":{"stringValue":"Deactivated"},"recruitClassOrCohort":{"stringValue":"Class A"},"isActive":{"booleanValue":false}}}'
```

Drive the UI with Playwright: log in as the seeded admin, navigate to `/recruits`, confirm "Ann Active" appears in the roster and "Bob Deactivated" does not, click "View Deactivated", confirm "Bob Deactivated" appears and "Ann Active" does not, click "Reactivate" on Bob's tile.

Confirm the write landed:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/recruits/verify-recruit-inactive" -H "Authorization: Bearer owner" | python3 -c "import sys,json; print(json.load(sys.stdin)['fields']['isActive']['booleanValue'])"
```

Expected output: `True`

Confirm Bob no longer appears on the Deactivated Recruits page (navigate back to `/recruits/deactivated` and check) and does appear again on `/recruits`.

Reset the emulator afterward: `curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/gfd-recruit-training/databases/(default)/documents"`.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/DeactivatedRecruitsPage.jsx web/src/App.jsx web/src/pages/RecruitsAdminPage.jsx
git commit -m "Add Deactivated Recruits page with Reactivate"
```
