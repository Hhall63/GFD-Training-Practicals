# Batch Grade Undo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin undo a Pass/Fail they just recorded on the Batch Grade roster screen — reversing a mis-tap without leaving a stray completed session sitting in reports.

**Architecture:** There is currently no undo capability anywhere in this app (confirmed by grepping the whole `web/src` tree and every `docs/superpowers` spec/plan for "undo" — zero hits outside unrelated confirmation-dialog copy). `BatchGradeRosterPage.jsx` tracks each recruit's graded state in local component state, `gradedByRecruitId: { [recruitId]: "pass" | "fail" }`, and once set it renders a read-only badge with no click handler — the session doc `recordBatchGradeResult()` created is never referenced again after being written. This plan (1) has `recordBatchGradeResult()`'s caller keep the `sessionId` it already returns instead of discarding it, (2) adds a `deleteBatchGradeResult(sessionId)` helper to `batchGrade.js` that removes the session and its one `lineResults` doc, and (3) adds an Undo button + confirm modal next to the badge that calls it and clears that recruit back to ungraded. Scope is deliberately limited to undoing a grade recorded in the current page visit (matching the existing local-state design) — re-deriving already-graded recruits after a page reload/navigation is a separate, unrequested change and is out of scope here.

**Tech Stack:** React 18 (function components + hooks), Firebase JS SDK v10 (Firestore — `writeBatch`), Vite. No unit-test framework is installed in `web/` — verification is done by driving the running app per the repo's `GFD-Training-Practicals/web:verify` skill (Firestore/Auth emulators + Playwright), same as every other recent plan in this repo (e.g. `docs/superpowers/plans/2026-07-13-admin-deactivate-confirmation-plan.md`).

## Global Constraints

- `web/firestore.rules:133-144` already grants `allow write: if isStaff();` on both `sessions/{sessionId}` and its `lineResults` subcollection — `write` covers create/update/**delete**, so deleting a session and its lineResults from a staff-authenticated client needs no rules change.
- Reuse the existing confirm-modal visual pattern verbatim: `position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)"` overlay, centered `.card`, `className="primary danger"` for the destructive confirm button, `className="secondary"` for Cancel — see `web/src/pages/AdminsPage.jsx`'s deactivate-confirmation modal (`docs/superpowers/plans/2026-07-13-admin-deactivate-confirmation-plan.md:64-91`) and `LiveTestRunnerPage.jsx:848-898`.
- Deleting a FAIL result does not un-send the failure-notification email that `recordBatchGradeResult()` already fired — note this as a known limitation in the confirm-modal copy so an admin isn't surprised. Do not attempt to recall/undo the email; that's out of scope.
- Do not change `recordBatchGradeResult()`'s existing signature or return shape (`{ sessionId, failureEmailStatus }`) — both callers (`gradePass`/`confirmFail`) already receive `sessionId`, they just currently throw it away.

---

## File Structure

- `web/src/lib/batchGrade.js` **(modify)** — add `deleteBatchGradeResult(sessionId)`.
- `web/src/pages/BatchGradeRosterPage.jsx` **(modify)** — track `sessionId` alongside each recruit's result, add the Undo button + confirm modal and its handler.

---

### Task 1: `deleteBatchGradeResult` data-layer helper

**Files:**
- Modify: `web/src/lib/batchGrade.js:1-16` (imports), append new function after `recordBatchGradeResult` (currently ends at line 188)

**Interfaces:**
- Consumes: `db` from `../firebase`; `collection`, `doc`, `getDocs`, `writeBatch` — all already imported in this file from `firebase/firestore`, no new imports needed.
- Produces: `async function deleteBatchGradeResult(sessionId: string): Promise<void>` — deletes every doc in `sessions/{sessionId}/lineResults` plus the `sessions/{sessionId}` doc itself, in one batch. Task 2 calls this with the `sessionId` it now keeps from `recordBatchGradeResult()`'s existing return value.

- [ ] **Step 1: Seed a session to verify against, and confirm the function doesn't exist yet**

This module talks to Firestore, so verification uses the project's emulator (per `GFD-Training-Practicals/web:verify`) rather than a Node-only script. Start the emulator harness first:

```bash
cd web
firebase emulators:start --only auth,firestore --project gfd-recruit-training &
```

Seed a session directly via the emulator's REST API to delete against:

```bash
curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions/verify-undo-session" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"recruitName":{"stringValue":"Undo Test"},"overallResult":{"stringValue":"pass"}}}'

curl -s -X PATCH "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions/verify-undo-session/lineResults/verify-line" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"result":{"stringValue":"pass"}}}'
```

Confirm the function doesn't exist yet: `grep -n "deleteBatchGradeResult" web/src/lib/batchGrade.js`
Expected: no output (not defined).

- [ ] **Step 2: Implement `deleteBatchGradeResult`**

No new imports are needed — `collection`, `doc`, `getDocs`, and `writeBatch` are already imported in `web/src/lib/batchGrade.js` (lines 1-13) and cover everything this function uses.

Append this function at the end of the file, after `recordBatchGradeResult` (after line 188):

```javascript
/**
 * Reverses a batch-grade result recorded by recordBatchGradeResult: deletes the session's
 * lineResults doc(s) first, then the session doc itself, in one batch so a mid-way failure
 * can't strand an orphaned lineResults doc under a deleted session. Does not attempt to
 * recall a failure-notification email that may have already been sent — see
 * docs/superpowers/plans/2026-07-18-batch-grade-undo-plan.md.
 */
export async function deleteBatchGradeResult(sessionId) {
  const lineResultsSnap = await getDocs(collection(db, "sessions", sessionId, "lineResults"));
  const batch = writeBatch(db);
  lineResultsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "sessions", sessionId));
  await batch.commit();
}
```

- [ ] **Step 3: Verify against the seeded session via the emulator's REST API**

`deleteBatchGradeResult` uses the Firebase JS SDK's `db` (from `web/src/firebase.js`), which is wired to `import.meta.env` and only resolvable inside the Vite app — it can't be exercised from a bare `node` script the way `web/src/lib/obstacleCourse.js`'s pure functions can. Confirm the seeded docs exist first:

```bash
curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions/verify-undo-session"
```
Expected: `200`, with the `recruitName`/`overallResult` fields from Step 1.

Real behavioral verification of this function happens in Task 2, Step 6, by actually clicking the Undo button it powers (this module has no standalone runner-script convention in this repo — Task 1 of the original `docs/superpowers/plans/2026-07-12-batch-grade-feature-plan.md` took the same approach: REST-seed/inspect in its own task, defer real exercise to the UI task).

Delete the seeded verification doc now (cleanup — Task 2's UI test creates its own real session rather than reusing this one):

```bash
curl -s -X DELETE "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions/verify-undo-session/lineResults/verify-line" -H "Authorization: Bearer owner"
curl -s -X DELETE "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions/verify-undo-session" -H "Authorization: Bearer owner"
```

- [ ] **Step 4: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/batchGrade.js
git commit -m "feat: add deleteBatchGradeResult for undoing a batch grade"
```

---

### Task 2: Undo button + confirm modal on the roster screen

**Files:**
- Modify: `web/src/pages/BatchGradeRosterPage.jsx`

**Interfaces:**
- Consumes: `deleteBatchGradeResult` from Task 1's `web/src/lib/batchGrade.js`; existing `recordBatchGradeResult`'s return value `{ sessionId, failureEmailStatus }` (`gradePass`/`confirmFail` already receive this, at lines 43 and 60 — they just don't keep `sessionId` today).
- Produces: nothing consumed elsewhere — self-contained page change.

- [ ] **Step 1: Track `sessionId` alongside each recruit's result**

In `web/src/pages/BatchGradeRosterPage.jsx`, change the state shape (line 18):

```javascript
// before:
  const [gradedByRecruitId, setGradedByRecruitId] = useState({}); // recruitId -> "pass" | "fail"

// after:
  const [gradedByRecruitId, setGradedByRecruitId] = useState({}); // recruitId -> { result: "pass"|"fail", sessionId }
  const [pendingUndo, setPendingUndo] = useState(null); // recruit currently confirming undo, or null
  const [undoingRecruitId, setUndoingRecruitId] = useState(null);
```

Update `gradePass` (lines 40-55) to keep the session id:

```javascript
  async function gradePass(recruit) {
    setSavingRecruitId(recruit.id);
    try {
      const { sessionId } = await recordBatchGradeResult({
        template,
        recruit,
        evaluatorName: adminDoc.displayName,
        result: RESULT.PASS,
        note: null,
        photoURLs: [],
      });
      setGradedByRecruitId((prev) => ({ ...prev, [recruit.id]: { result: RESULT.PASS, sessionId } }));
    } finally {
      setSavingRecruitId(null);
    }
  }
```

Update `confirmFail` (lines 57-73) the same way:

```javascript
  async function confirmFail(recruit, note, photoURLs) {
    setSavingRecruitId(recruit.id);
    try {
      const { sessionId } = await recordBatchGradeResult({
        template,
        recruit,
        evaluatorName: adminDoc.displayName,
        result: RESULT.FAIL,
        note,
        photoURLs,
      });
      setGradedByRecruitId((prev) => ({ ...prev, [recruit.id]: { result: RESULT.FAIL, sessionId } }));
      setFailTarget(null);
    } finally {
      setSavingRecruitId(null);
    }
  }
```

- [ ] **Step 2: Add the undo handlers**

Directly after `confirmFail`, add:

```javascript
  async function confirmUndo() {
    const recruit = pendingUndo;
    if (!recruit) return;
    const graded = gradedByRecruitId[recruit.id];
    if (!graded) return;
    setUndoingRecruitId(recruit.id);
    try {
      await deleteBatchGradeResult(graded.sessionId);
      setGradedByRecruitId((prev) => {
        const next = { ...prev };
        delete next[recruit.id];
        return next;
      });
      setPendingUndo(null);
    } finally {
      setUndoingRecruitId(null);
    }
  }

  function cancelUndo() {
    setPendingUndo(null);
  }
```

Add `deleteBatchGradeResult` to the existing import from `../lib/batchGrade` (line 10):

```javascript
// before:
import { recordBatchGradeResult } from "../lib/batchGrade";

// after:
import { deleteBatchGradeResult, recordBatchGradeResult } from "../lib/batchGrade";
```

- [ ] **Step 3: Update the badge rendering to read the new shape and add the Undo button**

Replace the `graded` read (line 86) and the badge block (lines 104-110):

```jsx
// before, line 86:
            const graded = gradedByRecruitId[recruit.id];

// after:
            const graded = gradedByRecruitId[recruit.id];
            const gradedResult = graded?.result;
```

```jsx
// before, lines 104-110:
                {graded ? (
                  <span
                    className={`badge ${graded === RESULT.PASS ? "pass" : "fail"}`}
                    style={{ display: "block", textAlign: "center", marginTop: 10 }}
                  >
                    {graded === RESULT.PASS ? "PASS" : "FAIL"}
                  </span>
                ) : (

// after:
                {graded ? (
                  <div style={{ marginTop: 10 }}>
                    <span
                      className={`badge ${gradedResult === RESULT.PASS ? "pass" : "fail"}`}
                      style={{ display: "block", textAlign: "center" }}
                    >
                      {gradedResult === RESULT.PASS ? "PASS" : "FAIL"}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      style={{ width: "100%", marginTop: 6, padding: "4px 8px" }}
                      onClick={() => setPendingUndo(recruit)}
                    >
                      Undo
                    </button>
                  </div>
                ) : (
```

(The `disabled={isSaving}` Pass/Fail buttons and their closing `)}`/`</div>` on the ungraded branch are unchanged.)

- [ ] **Step 4: Render the confirm-undo modal**

Immediately after the existing `{failTarget && <FailNoteModal ... />}` block (currently the last thing before the component's closing `</div>`, around line 145), add:

```jsx
      {pendingUndo && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ maxWidth: 320, padding: "24px", textAlign: "center" }}>
            <h3 style={{ marginBottom: 12 }}>Undo Grade?</h3>
            <p className="muted" style={{ marginBottom: 20 }}>
              {pendingUndo.firstName} {pendingUndo.lastName}'s{" "}
              {gradedByRecruitId[pendingUndo.id]?.result === RESULT.PASS ? "PASS" : "FAIL"} result
              for {template.name} will be permanently deleted and this recruit will show as
              ungraded again.
              {gradedByRecruitId[pendingUndo.id]?.result === RESULT.FAIL && (
                <>
                  <br />
                  <br />
                  If a failure-notification email already went out, this does not recall it.
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="secondary" style={{ flex: 1 }} onClick={cancelUndo}>
                Cancel
              </button>
              <button
                className="primary danger"
                style={{ flex: 1 }}
                disabled={undoingRecruitId === pendingUndo.id}
                onClick={confirmUndo}
              >
                {undoingRecruitId === pendingUndo.id ? "Undoing…" : "Yes, Undo"}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 6: Verify end-to-end against the running app**

Use the `GFD-Training-Practicals/web:verify` skill to start the emulator-backed harness, seed the admin login, then drive:

1. Admin Dashboard → Batch Grade → pick any seeded skill (e.g. "Hose Rolls") → Start Grading.
2. Tap **Pass** on a recruit. Confirm the badge shows PASS and an **Undo** button appears beneath it.
3. Tap **Undo**. Confirm the modal shows the recruit's name and PASS, with Cancel/Yes-Undo buttons.
4. Tap **Cancel** — confirm the badge/Undo button are unchanged (nothing deleted).
5. Tap **Undo** again, then **Yes, Undo**. Confirm the row reverts to the Pass/Fail buttons (ungraded).
6. Reports → this recruit's history: confirm no session for this skill remains (the undone grade never shows up).
7. Repeat for **Fail** (with a note): grade fail, undo, confirm the modal's extra "does not recall the email" line appears, confirm, and confirm the FAIL session is gone from Reports too.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/BatchGradeRosterPage.jsx
git commit -m "feat: let an admin undo a just-recorded batch grade"
```
