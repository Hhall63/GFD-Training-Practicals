# Grading Flow Critique Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent grading-flow fixes: Batch Grade's "Add New" picks from existing published tests instead of free-typing one, a live test only ever requires one overall failure note (not one per failed step) and every failure/note field can optionally carry a photo, and the Test Group builder shows each test's description under its name.

**Architecture:** Each fix touches exactly one existing file and reuses patterns already established elsewhere in the same file or a sibling page — no new library functions, no data-model changes, no new routes. See `docs/superpowers/specs/2026-07-19-grading-flow-critique-fixes-design.md` for the full rationale.

**Tech Stack:** React 18 (function components + hooks), Firebase JS SDK v10 (Firestore), Vite. No unit-test framework is installed in `web/` (no vitest/jest/test script in `web/package.json`) — verification is a live click-through against the emulator-backed harness via the `GFD-Training-Practicals/web:verify` skill, plus `npm run build` after each task.

## Global Constraints

- Batch Grade's official-test picker queries `templates` where `isActive == true` and `status == "published"`, then client-filters out `isBatchGrade`/`isWrittenExam` docs — the same set `TestGroupsAdminPage.jsx` already draws its own picker from.
- Picking an official test in that picker must call the existing `createBatchGradeTemplate(name, description)` from `web/src/lib/batchGrade.js` unchanged — no new library function, and the picked official template's own doc is never written to.
- `LiveTestRunnerPage.jsx`'s per-step fail-note gates (`stepFailed`) are deleted entirely, in both `advance()` and `submitAll()`. Only the last-line `overallFail` gate remains.
- Every per-step `AttachmentCapture` (Timer and Graded-line branches in `LineCard`) renders `isRequired={false}` unconditionally, matching the Obstacle Course branch's existing behavior.
- The "Note Required" modal in `LiveTestRunnerPage.jsx` and the "Aggressive Driving — Critical Failure" confirm modal in `ObstacleCourseRunner.jsx` each gain an optional photo control using the existing `compressImageToDataUrl` (`web/src/lib/image.js`) + array-append pattern. Neither modal's confirm button becomes gated on the photo — both stay gated on the note textarea only, exactly as today.
- Test Groups' test-selection checklist (`TestGroupsAdminPage.jsx`) shows `template.description` under `template.name` when present, muted style; the separate "Run Order" list is unchanged.
- No Firestore rules changes, no new routes, no new dependencies.

---

### Task 1: Batch Grade "Add New" picks an official test

**Files:**
- Modify: `web/src/pages/BatchGradePage.jsx`

**Interfaces:**
- Consumes: `createBatchGradeTemplate(name, description)` from `web/src/lib/batchGrade.js` (already imported in this file, unchanged signature) — returns `{ id, name, ...(description ? { description } : {}) }`.
- Produces: nothing new consumed by other files — `AddNewBatchTestModal`'s `onCreated(id)` callback signature is unchanged from today.

- [ ] **Step 1: Add the official-tests query**

In `web/src/pages/BatchGradePage.jsx`, add a new state variable right after the existing `pickerOpen` state (after line 14, `const [pickerOpen, setPickerOpen] = useState(false);`):

```javascript
  const [officialTests, setOfficialTests] = useState([]);
```

Add a new effect right after the existing templates-query effect (after line 31, the closing `}, []);` of the `templates` `onSnapshot` effect):

```javascript
  // The set of tests an admin can pick from in "Add New" below — published, non-batch-grade,
  // non-written-exam official tests (the same set TestGroupsAdminPage.jsx already draws its
  // own picker from). Picking one seeds a new lightweight batch-grade template with that
  // test's name/description; the official template itself is never touched.
  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isActive", "==", true),
      where("status", "==", "published")
    );
    return onSnapshot(q, (snap) => {
      setOfficialTests(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => !t.isBatchGrade && !t.isWrittenExam)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);
```

- [ ] **Step 2: Pass `officialTests` into the modal**

Change the render call (line 114-122):

```javascript
// before:
      {showAddNew && (
        <AddNewBatchTestModal
          onClose={() => setShowAddNew(false)}
          onCreated={(id) => {
            setShowAddNew(false);
            setSelectedId(id);
          }}
        />
      )}

// after:
      {showAddNew && (
        <AddNewBatchTestModal
          officialTests={officialTests}
          onClose={() => setShowAddNew(false)}
          onCreated={(id) => {
            setShowAddNew(false);
            setSelectedId(id);
          }}
        />
      )}
```

- [ ] **Step 3: Replace the free-text modal with a picker**

Replace the entire `AddNewBatchTestModal` function (lines 127-176) with:

```javascript
function AddNewBatchTestModal({ officialTests, onClose, onCreated }) {
  const [creatingId, setCreatingId] = useState(null);

  async function handlePick(test) {
    setCreatingId(test.id);
    try {
      const created = await createBatchGradeTemplate(test.name, test.description ?? "");
      onCreated(created.id);
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Modal titleId="add-new-batch-test-title" onClose={onClose} maxWidth={420}>
      <h3 id="add-new-batch-test-title" style={{ marginTop: 0 }}>Add Batch Grade Test</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Pick an existing published test to add to the Batch Grade list. The original test is
        unchanged — this just adds a quick pass/fail entry for it here.
      </p>
      {officialTests.length === 0 && <p className="muted">No published tests available yet.</p>}
      <div role="listbox" aria-labelledby="add-new-batch-test-title" style={{ maxHeight: "60vh", overflowY: "auto" }}>
        {officialTests.map((test) => (
          <button
            key={test.id}
            type="button"
            role="option"
            className="test-tile"
            disabled={creatingId !== null}
            onClick={() => handlePick(test)}
          >
            <div style={{ fontWeight: 600, fontSize: 16 }}>{test.name}</div>
            {test.description && <div className="muted">{test.description}</div>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
```

This reuses the `Modal` component already imported at the top of this file (`import Modal from "../components/Modal";`, used by the existing "Select a Test" picker) — no new import needed.

- [ ] **Step 4: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/BatchGradePage.jsx
git commit -m "feat: pick an official test for Batch Grade's Add New instead of free-typing one"
```

---

### Task 2: One overall failure note in the Live Test Runner, with an optional photo

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx`

**Interfaces:**
- Consumes: `patchLine(lineId, fields)` (already defined in this file) — used to write both `note` and `photoURLs` on the target line in one call.
- Produces: nothing new consumed by other files. `noteRequiredReason` state is removed (it only ever held `"overallFail"` after this change); no other file reads it.

- [ ] **Step 1: Remove the per-step note gate in `advance()`**

Replace `advance()` (lines 528-567) with:

```javascript
  async function advance() {
    // A stopping distance for both obstacle 2 and obstacle 5 must be recorded before this
    // step can be completed. (Scoring/pass-fail still happens on Finish without them — this
    // only gates moving on.)
    if (isObstacleCourse) {
      const missing = missingRequiredDistances(current.obstacleTallies);
      if (missing.length > 0) {
        setMissingDistanceObstacles(missing);
        setShowDistanceRequired(true);
        return;
      }
    }
    // The obstacle course (and any scored step) only sets its own result to FAIL on a hard
    // auto-fail trigger — a low but non-auto-fail score still reports PASS on the step even
    // though it can drag the overall test below the passing percentage. So on the last line,
    // preview the overall outcome and require one note if the *test* is about to fail — this
    // is the only note the Live Test Runner ever requires; an individual failed step never
    // blocks on its own (its AttachmentCapture box is always optional — see LineCard below).
    if (isLastLine && current.lineTypeSnapshot !== LINE_TYPES.INSTRUCTION && !hasFailNote()) {
      const { overallResult } = computeSessionOutcome(lineResultsRef.current ?? lineResults);
      if (overallResult === RESULT.FAIL) {
        noteTargetIdRef.current = current.id;
        noteContinuationRef.current = proceed;
        setNoteDraft(current.note ?? "");
        setNoteDraftPhotos(current.photoURLs ?? []);
        setShowNoteRequired(true);
        return;
      }
    }
    await proceed();
  }
```

- [ ] **Step 2: Remove the per-line note scan in `submitAll()`**

Replace `submitAll()` (lines 576-608) with:

```javascript
  async function submitAll() {
    const results = lineResultsRef.current ?? lineResults;

    // Same convention as Standard's last-line gate: the overall-fail note lives on the final
    // line in template order. This is the only note Checklist/Tile ever requires — an
    // individual failed line never blocks Submit on its own.
    const { overallResult } = computeSessionOutcome(results);
    if (overallResult === RESULT.FAIL) {
      const lastLine = results[results.length - 1];
      const lastHasNote = lastLine.photoURLs?.length > 0 || !!lastLine.note;
      if (!lastHasNote) {
        noteTargetIdRef.current = lastLine.id;
        noteContinuationRef.current = submitAll;
        setNoteDraft(lastLine.note ?? "");
        setNoteDraftPhotos(lastLine.photoURLs ?? []);
        setShowNoteRequired(true);
        return;
      }
    }

    await finishSessionAndContinue();
  }
```

- [ ] **Step 3: Drop the now-dead `noteRequiredReason` state and add `noteDraftPhotos`**

Replace the state declaration (line 61):

```javascript
// before:
  const [noteRequiredReason, setNoteRequiredReason] = useState("stepFailed"); // "stepFailed" | "overallFail"

// after:
  const [noteDraftPhotos, setNoteDraftPhotos] = useState([]);
```

Add a handler for the new photo control right after `hasFailNote()` (after lines 354-356):

```javascript
  async function handleNoteDraftPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file);
    setNoteDraftPhotos((prev) => [...prev, dataUrl]);
    e.target.value = "";
  }
```

`compressImageToDataUrl` is already imported at the top of this file (`import { compressImageToDataUrl } from "../lib/image";`) — no new import needed.

- [ ] **Step 4: Simplify the modal copy and add the photo control**

Replace the "Note Required" modal body (lines 873-906) with:

```javascript
          <div className="card" style={{ maxWidth: 340, padding: "24px", textAlign: "left" }}>
            <h3 style={{ marginBottom: 8 }}>Note Required</h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
              This test does not meet the passing score. Add a note explaining what happened
              before submitting.
            </p>
            <textarea
              autoFocus
              rows={3}
              placeholder="What did the recruit fail on?"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              style={{ width: "100%" }}
            />
            <div className="field" style={{ marginTop: 10 }}>
              <label>Photo (optional)</label>
              {noteDraftPhotos.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginRight: 8 }}
                />
              ))}
              <input type="file" accept="image/*" capture="environment" onChange={handleNoteDraftPhoto} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button className="secondary" style={{ flex: 1 }} onClick={() => setShowNoteRequired(false)}>
                Cancel
              </button>
              <button
                className="primary"
                style={{ flex: 1 }}
                disabled={!noteDraft.trim()}
                onClick={async () => {
                  await patchLine(noteTargetIdRef.current ?? current.id, {
                    note: noteDraft.trim(),
                    photoURLs: noteDraftPhotos,
                  });
                  setShowNoteRequired(false);
                  await (noteContinuationRef.current ?? proceed)();
                }}
              >
                Save & Continue
              </button>
            </div>
          </div>
```

- [ ] **Step 5: Make every per-step attachment box optional**

In `LineCard`, in the Timer branch (around line 1070), change:

```javascript
// before:
            {current.result && (
              <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={current.result === RESULT.FAIL} />
            )}

// after (this is inside the Timer branch's `current.timerElapsedSeconds == null` else-block):
            {current.result && (
              <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={false} />
            )}
```

In the Graded-line branch at the end of `LineCard` (around line 1138), change:

```javascript
// before:
      {current.result && (
        <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={current.result === RESULT.FAIL} />
      )}

// after:
      {current.result && (
        <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={false} />
      )}
```

Leave the Obstacle Course branch's `<AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={false} />` untouched — it already passes `false`.

- [ ] **Step 6: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx
git commit -m "feat: require only one overall failure note per test, not one per failed step"
```

---

### Task 3: Optional photo on the Aggressive Driving critical-failure confirm modal

**Files:**
- Modify: `web/src/components/ObstacleCourseRunner.jsx`

**Interfaces:**
- Consumes: `patchCurrent(fields)` prop (already used by this component) — extended to also write `photoURLs` alongside `note` in `confirmAggressiveDriving()`.
- Produces: nothing new consumed by other files.

- [ ] **Step 1: Import the photo-compression helper and add photo state**

Add the import at the top of `web/src/components/ObstacleCourseRunner.jsx` (after line 2, `import { RESULT } from "../lib/constants";`):

```javascript
import { compressImageToDataUrl } from "../lib/image";
```

Add state right after the existing `aggressiveDrivingNote` state (after line 37):

```javascript
  const [aggressiveDrivingPhotos, setAggressiveDrivingPhotos] = useState([]);
```

- [ ] **Step 2: Add the photo handler and extend `confirmAggressiveDriving()`**

Replace `confirmAggressiveDriving()` (lines 123-130) with:

```javascript
  // Confirms the critical failure: folds a positionless aggressiveDriving marker into the
  // tally (so computeObstacleCourseScore's autoFail picks it up the same way it already does
  // for the two existing triggers) and appends the required note (plus any optional photos)
  // onto the line's own `note`/`photoURLs` fields — the same fields LiveTestRunnerPage's
  // fail-note gate and the failure email already read, so this shows up everywhere a normal
  // fail-note does with no extra wiring.
  async function confirmAggressiveDriving() {
    const trimmed = aggressiveDrivingNote.trim();
    if (!trimmed) return;
    await commit({ ...tallies, markers: [...markers, { type: "aggressiveDriving" }] });
    await patchCurrent({
      note: current.note ? `${current.note}\n\n${trimmed}` : trimmed,
      photoURLs: [...(current.photoURLs ?? []), ...aggressiveDrivingPhotos],
    });
    setAggressiveDrivingNote("");
    setAggressiveDrivingPhotos([]);
    setShowAggressiveDrivingConfirm(false);
  }

  async function handleAggressiveDrivingPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file);
    setAggressiveDrivingPhotos((prev) => [...prev, dataUrl]);
    e.target.value = "";
  }
```

- [ ] **Step 3: Render the photo control and reset it on Cancel**

In the confirm modal's JSX (lines 303-352), replace the textarea-through-buttons block:

```javascript
// before:
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

// after:
            <textarea
              autoFocus
              rows={3}
              placeholder="What did the recruit do?"
              value={aggressiveDrivingNote}
              onChange={(e) => setAggressiveDrivingNote(e.target.value)}
              style={{ width: "100%" }}
            />
            <div className="field" style={{ marginTop: 10 }}>
              <label>Photo (optional)</label>
              {aggressiveDrivingPhotos.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginRight: 8 }}
                />
              ))}
              <input type="file" accept="image/*" capture="environment" onChange={handleAggressiveDrivingPhoto} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowAggressiveDrivingConfirm(false);
                  setAggressiveDrivingNote("");
                  setAggressiveDrivingPhotos([]);
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
```

- [ ] **Step 4: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ObstacleCourseRunner.jsx
git commit -m "feat: add optional photo attachment to the Aggressive Driving critical-failure modal"
```

---

### Task 4: Show each test's description under its name when building a Test Group

**Files:**
- Modify: `web/src/pages/TestGroupsAdminPage.jsx`

**Interfaces:**
- Consumes: `template.description` (already present on template docs, already read the same way by `BatchGradePage.jsx` and `TemplatesAdminPage.jsx`).
- Produces: nothing new consumed by other files.

- [ ] **Step 1: Add the description line under each test's name**

In `NewTestGroupModal`, replace the checklist row block (lines 158-171):

```javascript
// before:
        {templates.map((template) => (
          <label
            key={template.id}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={pickedIds.includes(template.id)}
              onChange={() => toggleTemplate(template.id)}
              style={{ width: "auto", margin: 0 }}
            />
            {template.name}
          </label>
        ))}

// after:
        {templates.map((template) => (
          <label
            key={template.id}
            style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={pickedIds.includes(template.id)}
              onChange={() => toggleTemplate(template.id)}
              style={{ width: "auto", margin: 0, marginTop: 3 }}
            />
            <span>
              <div>{template.name}</div>
              {template.description && <div className="muted">{template.description}</div>}
            </span>
          </label>
        ))}
```

- [ ] **Step 2: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/TestGroupsAdminPage.jsx
git commit -m "feat: show test description under its name when building a Test Group"
```

---

### Task 5: End-to-end verification and ship

**Files:** none (verification + git/GitHub only)

- [ ] **Step 1: Drive the app per the spec's Testing section**

Use the `GFD-Training-Practicals/web:verify` skill to start the emulator-backed harness (Firestore/Auth emulators + `VITE_USE_EMULATOR=1 npm run dev`), seed the admin login, then verify all five scenarios from `docs/superpowers/specs/2026-07-19-grading-flow-critique-fixes-design.md`'s Testing section:

1. Batch Grade → Add New lists published official tests only (no batch-grade/written-exam ones); picking one creates and selects a new batch-grade template with that name/description; the original official test is untouched in Manage Tests.
2. On a multi-step template with 2+ graded/critical steps, fail two different steps without touching their photo/note boxes — Next/Submit is never blocked until the last line, where (if the overall result is FAIL) the one overall "Note Required" popup appears exactly once, now with its photo control.
3. A failed step's attachment box reads "Add photo or note (optional)" (not the red "required" copy), and adding a photo there still works.
4. Obstacle Course: trigger "Aggressive Driving — Critical Failure"; its modal's new optional photo control attaches without being required to confirm.
5. Test Groups → New Test Group: each test's description renders under its name in the selection checklist.

- [ ] **Step 2: Push the branch and open a PR**

```bash
git push -u origin batch-grade-critique-fixes
gh pr create --draft --title "Grading flow critique fixes: batch-grade picker, single fail-note, test-group descriptions" --body "$(cat <<'EOF'
## Summary
- Batch Grade's "Add New" now picks from published official tests instead of free-typing a name/description
- Live Test Runner requires only one overall failure note per test, not one per failed step; every failure/note field can now optionally carry a photo
- Test Group builder shows each test's description under its name when selecting tests

## Test plan
- [ ] Batch Grade Add New picker lists published tests only, picking one seeds a new batch-grade template, original test untouched
- [ ] Multi-step template: failing 2+ steps never blocks Next/Submit; one overall Note Required popup (with photo) on overall fail
- [ ] Failed step's attachment box reads "optional", photo still attaches
- [ ] Aggressive Driving confirm modal's optional photo control works
- [ ] Test Groups selection checklist shows description under name

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge**

Once checks (if any) pass and the PR is reviewed, merge it:

```bash
gh pr merge --squash --delete-branch
```

If the user has asked for an immediate merge without separate review, confirm the PR's diff matches exactly the five commits from Tasks 1-4 before merging.
