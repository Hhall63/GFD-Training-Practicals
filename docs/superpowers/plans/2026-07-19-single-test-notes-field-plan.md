# Single Test-Level Notes Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile "note piggybacked on whichever line is last" convention with a real single test-level notes/photo field, always visible in Standard/Checklist/Tile grading views and consistently shown in reporting, without changing who is allowed to see evaluator notes.

**Architecture:** A new staff-only Firestore subcollection doc, `sessions/{sessionId}/testNotes/main`, holding `{ note, photoURLs }` for the whole test. `LiveTestRunnerPage.jsx` gets a persistent "Test Notes" banner (visible in all three view modes) reading/writing this doc, and its existing "Note Required" gate/modal is repointed at it instead of a line. Two reporting screens display it, falling back to the old last-line note only for sessions that predate this fix. `lib/notify.js`'s failure email gains the same note. See `docs/superpowers/specs/2026-07-19-single-test-notes-field-design.md` for full rationale.

**Tech Stack:** React 18 (function components + hooks), Firebase JS SDK v10 (Firestore), Vite. No unit-test framework is installed in `web/` — verification is a live click-through against the emulator-backed harness via the `GFD-Training-Practicals/web:verify` skill, plus `npm run build` after each task.

## Global Constraints

- The new note/photos live in `sessions/{sessionId}/testNotes/main`, never as fields on the `sessions` document itself — a Firestore document read is all-or-nothing, and the top-level `sessions` doc is already readable by the recruit (their own session) and the anonymous Live Dashboard viewer, who must never gain access to evaluator notes.
- Every session-creation site seeds `testNotes/main` as `{ note: "", photoURLs: [] }` in the same batch as the `lineResults` seed.
- `LiveTestRunnerPage.jsx`'s per-line `AttachmentCapture` component and all three of its call sites are deleted entirely. One notes box for the whole test, shown in a persistent banner visible in Standard, Checklist, and Tile alike.
- The "Note Required" modal's trigger condition (only when the computed overall outcome is FAIL and no note yet exists) and its UX are unchanged — only its read/write target moves from a line to `testNotes/main`.
- The legacy-fallback signal for reporting screens is `testNotes/main` document **existence** (`snap.exists()`), never emptiness — see the spec's "Backward compatibility" section for why emptiness would wrongly hide Obstacle Course's unrelated, still-active aggressive-driving note.
- Batch Grade (`BatchGradeRosterPage.jsx`) and Obstacle Course's aggressive-driving critical-failure note (`ObstacleCourseRunner.jsx`) are untouched — out of scope.
- No new npm dependencies, no new routes.

---

### Task 1: Firestore rules — staff-only `testNotes` subcollection

**Files:**
- Modify: `web/firestore.rules:141-144`

**Interfaces:**
- Produces: a `testNotes` subcollection under `sessions/{sessionId}` readable/writable only by `isStaff()` — every later task's reads/writes against `sessions/{id}/testNotes/main` depend on this rule existing.

- [ ] **Step 1: Add the `testNotes` match block**

Replace (lines 141-144):

```
      match /lineResults/{lineResultId} {
        allow read, write: if isStaff();
      }
    }
```

with:

```
      match /lineResults/{lineResultId} {
        allow read, write: if isStaff();
      }

      // The one test-level note/photos. Same staff-only boundary as lineResults above —
      // kept off the sessions document itself so it's never included in the recruit/
      // anonymous-Live-Dashboard read grant above (see that match block's own comment).
      match /testNotes/{noteId} {
        allow read, write: if isStaff();
      }
    }
```

- [ ] **Step 2: Restart the emulator harness so it picks up the new rule**

Use the `GFD-Training-Practicals/web:verify` skill to (re)start the Firestore/Auth emulators — rules are loaded once at emulator startup, so an already-running emulator won't see this change.

- [ ] **Step 3: Commit**

```bash
git add web/firestore.rules
git commit -m "feat: add staff-only testNotes subcollection to session rules"
```

---

### Task 2: Seed `testNotes/main` at session creation

**Files:**
- Modify: `web/src/pages/RecruitConfirmPage.jsx:169-193`
- Modify: `web/src/pages/LiveTestRunnerPage.jsx:507-529` (`goToNextTest()`)

**Interfaces:**
- Consumes: the `testNotes` rule from Task 1.
- Produces: every session created after this task always has a `testNotes/main` doc — Task 3's `patchTestNote` can safely assume it exists, and Task 5/6's reporting fallback only ever triggers for sessions created *before* this ships.

- [ ] **Step 1: Seed it in `RecruitConfirmPage.jsx`'s `beginTest()`**

Replace (lines 169-193):

```javascript
      const batch = writeBatch(db);
      lines.forEach((line) => {
        const lineResultRef = doc(collection(db, "sessions", sessionRef.id, "lineResults"));
        const isObstacleCourse = line.lineType === LINE_TYPES.OBSTACLE_COURSE;
        batch.set(lineResultRef, {
          sortOrder: line.sortOrder,
          lineTypeSnapshot: line.lineType,
          lineTextSnapshot: line.lineText,
          passThresholdSecondsSnapshot: line.passThresholdSeconds ?? null,
          pointsSnapshot: line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : null,
          isCriticalSnapshot: line.isCritical ?? false,
          // The course is a fixed department form, so snapshot the baked-in scoring rules
          // rather than anything stored on the template line.
          obstacleCourseConfigSnapshot: isObstacleCourse ? defaultObstacleCourseConfig() : null,
          obstacleTallies: isObstacleCourse ? seedObstacleTallies() : null,
          result: line.lineType === LINE_TYPES.INSTRUCTION ? RESULT.NOT_APPLICABLE : null,
          pointsEarned: null,
          timerElapsedSeconds: null,
          note: null,
          photoURLs: [],
        });
      });
      await batch.commit();

      navigate(`/session/${sessionRef.id}/run`, { replace: true, state: { initialViewMode: viewMode } });
```

with:

```javascript
      const batch = writeBatch(db);
      lines.forEach((line) => {
        const lineResultRef = doc(collection(db, "sessions", sessionRef.id, "lineResults"));
        const isObstacleCourse = line.lineType === LINE_TYPES.OBSTACLE_COURSE;
        batch.set(lineResultRef, {
          sortOrder: line.sortOrder,
          lineTypeSnapshot: line.lineType,
          lineTextSnapshot: line.lineText,
          passThresholdSecondsSnapshot: line.passThresholdSeconds ?? null,
          pointsSnapshot: line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : null,
          isCriticalSnapshot: line.isCritical ?? false,
          // The course is a fixed department form, so snapshot the baked-in scoring rules
          // rather than anything stored on the template line.
          obstacleCourseConfigSnapshot: isObstacleCourse ? defaultObstacleCourseConfig() : null,
          obstacleTallies: isObstacleCourse ? seedObstacleTallies() : null,
          result: line.lineType === LINE_TYPES.INSTRUCTION ? RESULT.NOT_APPLICABLE : null,
          pointsEarned: null,
          timerElapsedSeconds: null,
          note: null,
          photoURLs: [],
        });
      });
      // The one test-level note/photos this session will ever have — seeded empty so
      // LiveTestRunnerPage's persistent Test Notes banner and Note Required gate always
      // find a doc to read/write, never patching a nonexistent one.
      batch.set(doc(db, "sessions", sessionRef.id, "testNotes", "main"), { note: "", photoURLs: [] });
      await batch.commit();

      navigate(`/session/${sessionRef.id}/run`, { replace: true, state: { initialViewMode: viewMode } });
```

- [ ] **Step 2: Seed it in `LiveTestRunnerPage.jsx`'s `goToNextTest()`**

Replace (lines 507-529):

```javascript
      const batch = writeBatch(db);
      lines.forEach((line) => {
        const lineResultRef = doc(collection(db, "sessions", nextSessionRef.id, "lineResults"));
        const isObstacleCourse = line.lineType === LINE_TYPES.OBSTACLE_COURSE;
        batch.set(lineResultRef, {
          sortOrder: line.sortOrder,
          lineTypeSnapshot: line.lineType,
          lineTextSnapshot: line.lineText,
          passThresholdSecondsSnapshot: line.passThresholdSeconds ?? null,
          pointsSnapshot: line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : null,
          isCriticalSnapshot: line.isCritical ?? false,
          obstacleCourseConfigSnapshot: isObstacleCourse ? defaultObstacleCourseConfig() : null,
          obstacleTallies: isObstacleCourse ? seedObstacleTallies() : null,
          result: line.lineType === LINE_TYPES.INSTRUCTION ? RESULT.NOT_APPLICABLE : null,
          pointsEarned: null,
          timerElapsedSeconds: null,
          note: null,
          photoURLs: [],
        });
      });
      await batch.commit();

      navigate(`/session/${nextSessionRef.id}/run`, { replace: true, state: { initialViewMode: viewMode } });
```

with:

```javascript
      const batch = writeBatch(db);
      lines.forEach((line) => {
        const lineResultRef = doc(collection(db, "sessions", nextSessionRef.id, "lineResults"));
        const isObstacleCourse = line.lineType === LINE_TYPES.OBSTACLE_COURSE;
        batch.set(lineResultRef, {
          sortOrder: line.sortOrder,
          lineTypeSnapshot: line.lineType,
          lineTextSnapshot: line.lineText,
          passThresholdSecondsSnapshot: line.passThresholdSeconds ?? null,
          pointsSnapshot: line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : null,
          isCriticalSnapshot: line.isCritical ?? false,
          obstacleCourseConfigSnapshot: isObstacleCourse ? defaultObstacleCourseConfig() : null,
          obstacleTallies: isObstacleCourse ? seedObstacleTallies() : null,
          result: line.lineType === LINE_TYPES.INSTRUCTION ? RESULT.NOT_APPLICABLE : null,
          pointsEarned: null,
          timerElapsedSeconds: null,
          note: null,
          photoURLs: [],
        });
      });
      batch.set(doc(db, "sessions", nextSessionRef.id, "testNotes", "main"), { note: "", photoURLs: [] });
      await batch.commit();

      navigate(`/session/${nextSessionRef.id}/run`, { replace: true, state: { initialViewMode: viewMode } });
```

- [ ] **Step 3: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/RecruitConfirmPage.jsx web/src/pages/LiveTestRunnerPage.jsx
git commit -m "feat: seed a testNotes/main doc for every new session"
```

---

### Task 3: Persistent Test Notes banner and session-level note logic in `LiveTestRunnerPage.jsx`

**Files:**
- Modify: `web/src/pages/LiveTestRunnerPage.jsx`

**Interfaces:**
- Consumes: `testNotes/main` doc seeded by Task 2.
- Produces: `patchTestNote(fields)` and `hasOverallNote()` (used again by Task 4's `finishSession()` edit) and `testNote` / `testNoteRef` state (also read by Task 4).

- [ ] **Step 1: Import `setDoc`**

Replace (line 3-14):

```javascript
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
```

with:

```javascript
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
```

- [ ] **Step 2: Replace `noteTargetIdRef` with `testNote` state**

Replace:

```javascript
  const [showNoteRequired, setShowNoteRequired] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDraftPhotos, setNoteDraftPhotos] = useState([]);
  // Which line the Note Required modal's "Save & Continue" writes to, and what to run
  // afterward. Standard view always targets `current` and resumes via proceed(). Checklist/
  // Tile submitAll() targets the last line in template order (where the overall-fail note
  // always lives) and resumes via submitAll() itself.
  const noteTargetIdRef = useRef(null);
  const noteContinuationRef = useRef(null);
```

with:

```javascript
  const [showNoteRequired, setShowNoteRequired] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDraftPhotos, setNoteDraftPhotos] = useState([]);
  // What to run after the Note Required modal's "Save & Continue" saves the note:
  // proceed() for Standard view's last-line gate, submitAll() for Checklist/Tile's.
  const noteContinuationRef = useRef(null);
  // The single test-level note/photos (staff-only sessions/{id}/testNotes/main doc), shown
  // in the persistent banner below and required (via the Note Required modal) when the
  // computed overall result is a FAIL. Defaults match what a freshly-seeded doc looks like,
  // so the banner renders sensibly even before the initial fetch resolves.
  const [testNote, setTestNote] = useState({ note: "", photoURLs: [] });
  // Same stale-closure guard as lineResultsRef: finishSession()/advance()/submitAll() need
  // the just-patched note even when they run inside the same handler that patched it, before
  // a re-render has happened.
  const testNoteRef = useRef({ note: "", photoURLs: [] });
```

- [ ] **Step 3: Fetch `testNotes/main` on mount**

Replace:

```javascript
  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then(async (snap) => {
      const data = snap.data();
      setSessionData(data);
      if (data?.groupId) {
        const groupSnap = await getDoc(doc(db, "testGroups", data.groupId));
        if (groupSnap.exists()) setGroupTemplateIds(groupSnap.data().templateIds ?? []);
      }
    });
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then(
      (snap) => {
        const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lineResultsRef.current = results;
        setLineResults(results);
      }
    );
  }, [sessionId]);
```

with:

```javascript
  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then(async (snap) => {
      const data = snap.data();
      setSessionData(data);
      if (data?.groupId) {
        const groupSnap = await getDoc(doc(db, "testGroups", data.groupId));
        if (groupSnap.exists()) setGroupTemplateIds(groupSnap.data().templateIds ?? []);
      }
    });
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then(
      (snap) => {
        const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lineResultsRef.current = results;
        setLineResults(results);
      }
    );
    // Sessions created before this field existed have no testNotes/main doc — default to
    // the same empty shape a freshly-seeded doc has, rather than leaving state undefined.
    getDoc(doc(db, "sessions", sessionId, "testNotes", "main")).then((snap) => {
      const data = snap.exists() ? snap.data() : { note: "", photoURLs: [] };
      testNoteRef.current = data;
      setTestNote(data);
    });
  }, [sessionId]);
```

- [ ] **Step 4: Add `patchTestNote`**

Replace:

```javascript
  function patchCurrent(fields) {
    return patchLine(current.id, fields);
  }
```

with:

```javascript
  function patchCurrent(fields) {
    return patchLine(current.id, fields);
  }

  // Writes the one test-level note, shared by the persistent Test Notes banner (any time
  // during the test) and the Note Required modal (on a computed overall fail). setDoc with
  // merge, not updateDoc, since a session created before this field existed may not have a
  // testNotes/main doc yet.
  function patchTestNote(fields) {
    setTestNote((prev) => {
      const updated = { ...prev, ...fields };
      testNoteRef.current = updated;
      return updated;
    });
    return setDoc(doc(db, "sessions", sessionId, "testNotes", "main"), fields, { merge: true });
  }
```

- [ ] **Step 5: Replace `hasFailNote()` with `hasOverallNote()`**

Replace:

```javascript
  function hasFailNote() {
    return current.photoURLs?.length > 0 || !!current.note;
  }
```

with:

```javascript
  function hasOverallNote() {
    const n = testNoteRef.current ?? testNote;
    return n?.photoURLs?.length > 0 || !!n?.note;
  }
```

- [ ] **Step 6: Update `advance()`'s last-line gate**

Replace:

```javascript
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
```

with:

```javascript
    // The obstacle course (and any scored step) only sets its own result to FAIL on a hard
    // auto-fail trigger — a low but non-auto-fail score still reports PASS on the step even
    // though it can drag the overall test below the passing percentage. So on the last line,
    // preview the overall outcome and require the one test-level note if the *test* is about
    // to fail — this is the only note the Live Test Runner ever requires; an individual
    // failed step never blocks on its own, and the note lives on the test itself (the
    // persistent Test Notes banner), not on any one line.
    if (isLastLine && current.lineTypeSnapshot !== LINE_TYPES.INSTRUCTION && !hasOverallNote()) {
      const { overallResult } = computeSessionOutcome(lineResultsRef.current ?? lineResults);
      if (overallResult === RESULT.FAIL) {
        noteContinuationRef.current = proceed;
        setNoteDraft(testNoteRef.current?.note ?? "");
        setNoteDraftPhotos(testNoteRef.current?.photoURLs ?? []);
        setShowNoteRequired(true);
        return;
      }
    }
    await proceed();
```

- [ ] **Step 7: Update `submitAll()`'s gate**

Replace:

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

with:

```javascript
  async function submitAll() {
    const results = lineResultsRef.current ?? lineResults;

    // Same convention as Standard's last-line gate: one test-level note is the only note
    // Checklist/Tile ever requires — an individual failed line never blocks Submit on its
    // own, and the note lives on the test itself, not on any one line.
    const { overallResult } = computeSessionOutcome(results);
    if (overallResult === RESULT.FAIL && !hasOverallNote()) {
      noteContinuationRef.current = submitAll;
      setNoteDraft(testNoteRef.current?.note ?? "");
      setNoteDraftPhotos(testNoteRef.current?.photoURLs ?? []);
      setShowNoteRequired(true);
      return;
    }

    await finishSessionAndContinue();
  }
```

- [ ] **Step 8: Repoint the "Note Required" modal's Save & Continue**

Replace:

```javascript
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
```

with:

```javascript
              <button
                className="primary"
                style={{ flex: 1 }}
                disabled={!noteDraft.trim()}
                onClick={async () => {
                  await patchTestNote({ note: noteDraft.trim(), photoURLs: noteDraftPhotos });
                  setShowNoteRequired(false);
                  await (noteContinuationRef.current ?? proceed)();
                }}
              >
                Save & Continue
              </button>
```

- [ ] **Step 9: Render the persistent Test Notes banner**

Replace:

```javascript
      {isTimerRunning && (
        <div className="timer-banner">
          <span>Timer running: {formatSeconds(elapsed)}s</span>
          <button onClick={stopTimer}>Stop</button>
        </div>
      )}

      {!hasObstacleCourse && (
        <div style={{ padding: "12px 16px 0", maxWidth: 720, margin: "0 auto", width: "100%" }}>
          <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      )}
```

with:

```javascript
      {isTimerRunning && (
        <div className="timer-banner">
          <span>Timer running: {formatSeconds(elapsed)}s</span>
          <button onClick={stopTimer}>Stop</button>
        </div>
      )}

      {/* One note for the whole test, visible and editable from every view (Standard,
          Checklist, Tile) — not tied to whichever line happens to be current or last. */}
      <div style={{ padding: "12px 16px 0", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        <TestNotesBanner
          note={testNote.note}
          photoURLs={testNote.photoURLs}
          onChangeNote={(value) => patchTestNote({ note: value })}
          onAddPhoto={async (file) => {
            const dataUrl = await compressImageToDataUrl(file);
            await patchTestNote({
              photoURLs: [...(testNoteRef.current?.photoURLs ?? []), dataUrl],
            });
          }}
        />
      </div>

      {!hasObstacleCourse && (
        <div style={{ padding: "12px 16px 0", maxWidth: 720, margin: "0 auto", width: "100%" }}>
          <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      )}
```

- [ ] **Step 10: Add the `TestNotesBanner` component**

Replace:

```javascript
// "Change View" control, shared by the top of this page. Purely presentational — it only
// ever calls setViewMode, never anything that touches currentIndex/lineResults/the timer.
function ViewSwitcher({ viewMode, setViewMode }) {
  return (
    <div className="segmented">
      {["standard", "checklist", "tile"].map((mode) => (
        <button
          key={mode}
          className={`segment ${viewMode === mode ? "active" : ""}`}
          onClick={() => setViewMode(mode)}
        >
          {mode === "standard" ? "Standard" : mode === "checklist" ? "Checklist" : "Tile"}
        </button>
      ))}
    </div>
  );
}
```

with:

```javascript
// "Change View" control, shared by the top of this page. Purely presentational — it only
// ever calls setViewMode, never anything that touches currentIndex/lineResults/the timer.
function ViewSwitcher({ viewMode, setViewMode }) {
  return (
    <div className="segmented">
      {["standard", "checklist", "tile"].map((mode) => (
        <button
          key={mode}
          className={`segment ${viewMode === mode ? "active" : ""}`}
          onClick={() => setViewMode(mode)}
        >
          {mode === "standard" ? "Standard" : mode === "checklist" ? "Checklist" : "Tile"}
        </button>
      ))}
    </div>
  );
}

// One note/photo box for the whole test, shown in every view (Standard/Checklist/Tile)
// and editable at any time — the single place a note ever gets written for a live test.
function TestNotesBanner({ note, photoURLs, onChangeNote, onAddPhoto }) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onAddPhoto(file);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="card" style={{ textAlign: "left" }}>
      <strong style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        📝 Test Notes (required if this test fails)
      </strong>
      <div style={{ marginTop: 10 }}>
        {photoURLs.map((url) => (
          <img
            key={url}
            src={url}
            alt=""
            style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, marginRight: 8 }}
          />
        ))}
        <div style={{ margin: "10px 0" }}>
          <label>
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
            <span
              className="secondary"
              style={{ display: "inline-block", padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer" }}
            >
              {uploading ? "Uploading…" : "📷 Add Photo"}
            </span>
          </label>
        </div>
        <textarea
          placeholder="Notes for this test"
          rows={2}
          value={note}
          onChange={(e) => onChangeNote(e.target.value)}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Remove the per-line `AttachmentCapture` from the Timer branch**

Replace:

```javascript
        ) : (
          <>
            <div className={`badge ${current.result === RESULT.PASS ? "pass" : "fail"}`} style={{ fontSize: 16, marginBottom: 12 }}>
              {current.result === RESULT.PASS ? "PASS" : "FAIL"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="secondary" onClick={() => startTimer(current.id)}>Retry</button>
              <button
                className="secondary"
                onClick={() => setGradedResult(current.result === RESULT.PASS ? RESULT.FAIL : RESULT.PASS)}
              >
                Mark {current.result === RESULT.PASS ? "Fail" : "Pass"} Instead
              </button>
            </div>
            {current.result && (
              <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={false} />
            )}
          </>
        )}
      </div>
    );
  }
```

with:

```javascript
        ) : (
          <>
            <div className={`badge ${current.result === RESULT.PASS ? "pass" : "fail"}`} style={{ fontSize: 16, marginBottom: 12 }}>
              {current.result === RESULT.PASS ? "PASS" : "FAIL"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="secondary" onClick={() => startTimer(current.id)}>Retry</button>
              <button
                className="secondary"
                onClick={() => setGradedResult(current.result === RESULT.PASS ? RESULT.FAIL : RESULT.PASS)}
              >
                Mark {current.result === RESULT.PASS ? "Fail" : "Pass"} Instead
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
```

- [ ] **Step 12: Remove the per-line `AttachmentCapture` from the Obstacle Course branch**

Replace:

```javascript
  if (current.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE) {
    return (
      <div className="center-column" style={{ paddingTop: 0 }}>
        <ObstacleCourseRunner current={current} patchCurrent={patchCurrent} />
        {/* Always shown as optional so it never reveals the pass/fail outcome here; the note
            is instead required (when the run fails) via the pop-up on Submit. */}
        {current.result && (
          <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={false} />
        )}
      </div>
    );
  }
```

with:

```javascript
  if (current.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE) {
    return (
      <div className="center-column" style={{ paddingTop: 0 }}>
        <ObstacleCourseRunner current={current} patchCurrent={patchCurrent} />
      </div>
    );
  }
```

- [ ] **Step 13: Remove the per-line `AttachmentCapture` from the Graded-line branch, and delete the `AttachmentCapture` component itself**

Replace (this is the remainder of the file, from the Graded-line return through the end of `AttachmentCapture`):

```javascript
  // Graded line
  return (
    <div className="center-column" style={{ paddingTop: 16 }}>
      <p
        style={{ fontSize: 20, fontWeight: 500 }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.lineTextSnapshot) }}
      />
      <p className="muted" style={{ fontWeight: 600 }}>
        Worth {current.pointsSnapshot ?? 0} pts
        {current.isCriticalSnapshot && <span style={{ color: "var(--brand-red)" }}> · CRITICAL</span>}
      </p>
      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 400, marginTop: 16 }}>
        <button
          className={`primary ${current.result === RESULT.PASS ? "pass-muted" : ""}`}
          style={{ background: current.result === RESULT.PASS ? undefined : "#c7c7cc" }}
          onClick={() => setGradedResult(RESULT.PASS)}
        >
          Pass
        </button>
        <button
          className={`primary ${current.result === RESULT.FAIL ? "fail-muted" : ""}`}
          style={{ background: current.result === RESULT.FAIL ? undefined : "#c7c7cc" }}
          onClick={() => setGradedResult(RESULT.FAIL)}
        >
          Fail
        </button>
      </div>
      {current.result && (
        <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={false} />
      )}
    </div>
  );
}

function AttachmentCapture({ current, patchCurrent, isRequired }) {
  const [note, setNote] = useState(current.note ?? "");
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(isRequired);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      await patchCurrent({ photoURLs: [...(current.photoURLs ?? []), dataUrl] });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div
      className="card"
      style={{
        width: "100%",
        maxWidth: 400,
        marginTop: 16,
        textAlign: "left",
        background: isRequired ? "rgba(196,33,47,0.06)" : undefined,
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        <strong style={{ color: isRequired ? "var(--brand-red)" : "var(--text-secondary)", fontSize: 14 }}>
          {isRequired ? "⚠️ Photo or note required for a Fail result" : "📎 Add photo or note (optional)"}
        </strong>
      </button>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {(current.photoURLs ?? []).map((url) => (
            <img key={url} src={url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginRight: 8 }} />
          ))}
          <div style={{ margin: "10px 0" }}>
            <label>
              <input type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
              <span className="secondary" style={{ display: "inline-block", padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer" }}>
                {uploading ? "Uploading…" : "📷 Take Photo"}
              </span>
            </label>
          </div>
          <textarea
            placeholder="Note"
            rows={2}
            value={note}
            // Persist on every keystroke, not just blur: on mobile (especially iOS Safari),
            // tapping Submit while the textarea is still focused can fire the click before a
            // blur-only save lands, leaving the note-required gate and the failure email
            // reading a stale, empty note even though one was typed.
            onChange={(e) => {
              setNote(e.target.value);
              patchCurrent({ note: e.target.value });
            }}
          />
        </div>
      )}
    </div>
  );
}
```

with:

```javascript
  // Graded line
  return (
    <div className="center-column" style={{ paddingTop: 16 }}>
      <p
        style={{ fontSize: 20, fontWeight: 500 }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.lineTextSnapshot) }}
      />
      <p className="muted" style={{ fontWeight: 600 }}>
        Worth {current.pointsSnapshot ?? 0} pts
        {current.isCriticalSnapshot && <span style={{ color: "var(--brand-red)" }}> · CRITICAL</span>}
      </p>
      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 400, marginTop: 16 }}>
        <button
          className={`primary ${current.result === RESULT.PASS ? "pass-muted" : ""}`}
          style={{ background: current.result === RESULT.PASS ? undefined : "#c7c7cc" }}
          onClick={() => setGradedResult(RESULT.PASS)}
        >
          Pass
        </button>
        <button
          className={`primary ${current.result === RESULT.FAIL ? "fail-muted" : ""}`}
          style={{ background: current.result === RESULT.FAIL ? undefined : "#c7c7cc" }}
          onClick={() => setGradedResult(RESULT.FAIL)}
        >
          Fail
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors. (`current`/`patchCurrent` props on `LineCard` are still used by the Timer/Obstacle Course/Graded branches for grading itself — only the attachment box is gone.)

- [ ] **Step 15: Commit**

```bash
git add web/src/pages/LiveTestRunnerPage.jsx
git commit -m "feat: replace per-line note box with a persistent test-level notes banner"
```

---

### Task 4: Include the test-level note in the failure email

**Files:**
- Modify: `web/src/lib/notify.js`
- Modify: `web/src/pages/LiveTestRunnerPage.jsx` (one call site in `finishSession()`)

**Interfaces:**
- Consumes: `testNoteRef` / `testNote` from Task 3.
- Produces: `buildFailureBody(session, lineResults, overallNote)`, `buildFailureMailto(recipients, session, lineResults, overallNote)`, `sendFailureEmail(session, lineResults, overallNote)` — all three now take a required-in-practice third argument; Task 5's `ResultsPage.jsx` change also calls `buildFailureMailto` with this new signature.

- [ ] **Step 1: Add `overallNote` to `buildFailureBody`**

Replace:

```javascript
export function buildFailureBody(session, lineResults) {
  const lines = [];
  lines.push(
    `Recruit ${session.recruitName} failed the ${session.templateName} with a score of ${scoreLine(session)}.`
  );
  lines.push("");
  lines.push(`Attempt: ${session.attemptType === "retake" ? "Retake" : "1st Attempt"}`);
  lines.push(`Evaluator: ${session.evaluatorName}`);
  const when = session.startedAt?.toDate?.() ?? new Date();
  lines.push(`Date: ${when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`);
  if (session.criticalFailure) {
    lines.push("CRITICAL FAILURE: a step marked critical was failed — automatic test failure.");
  }
  // EmailJS attachments require a paid plan, so the graded course (with every penalty/
  // distance marker) isn't attached — a direct link to view it in the app is the free
  // alternative. Session detail is admin-only, matching who gets this email.
  if (session.id) {
    lines.push(`View full results (with the graded course diagram): ${window.location.origin}/reports/sessions/${session.id}`);
  }
  lines.push("");
  lines.push("--- FULL TEST SHEET ---");
```

with:

```javascript
export function buildFailureBody(session, lineResults, overallNote) {
  const lines = [];
  lines.push(
    `Recruit ${session.recruitName} failed the ${session.templateName} with a score of ${scoreLine(session)}.`
  );
  lines.push("");
  lines.push(`Attempt: ${session.attemptType === "retake" ? "Retake" : "1st Attempt"}`);
  lines.push(`Evaluator: ${session.evaluatorName}`);
  const when = session.startedAt?.toDate?.() ?? new Date();
  lines.push(`Date: ${when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`);
  if (session.criticalFailure) {
    lines.push("CRITICAL FAILURE: a step marked critical was failed — automatic test failure.");
  }
  // EmailJS attachments require a paid plan, so the graded course (with every penalty/
  // distance marker) isn't attached — a direct link to view it in the app is the free
  // alternative. Session detail is admin-only, matching who gets this email.
  if (session.id) {
    lines.push(`View full results (with the graded course diagram): ${window.location.origin}/reports/sessions/${session.id}`);
  }
  if (overallNote?.note) {
    lines.push("");
    lines.push(`Evaluator notes: ${overallNote.note}`);
  }
  if (overallNote?.photoURLs?.length > 0) {
    lines.push(`Photos: ${overallNote.photoURLs.length} attached — view in the app (Reports > Recruit Transcript)`);
  }
  lines.push("");
  lines.push("--- FULL TEST SHEET ---");
```

- [ ] **Step 2: Thread `overallNote` through `buildFailureMailto`**

Replace:

```javascript
export function buildFailureMailto(recipients, session, lineResults) {
  const subject = encodeURIComponent(buildFailureSubject(session));
  const body = encodeURIComponent(buildFailureBody(session, lineResults));
  return `mailto:${recipients.join(",")}?subject=${subject}&body=${body}`;
}
```

with:

```javascript
export function buildFailureMailto(recipients, session, lineResults, overallNote) {
  const subject = encodeURIComponent(buildFailureSubject(session));
  const body = encodeURIComponent(buildFailureBody(session, lineResults, overallNote));
  return `mailto:${recipients.join(",")}?subject=${subject}&body=${body}`;
}
```

- [ ] **Step 3: Thread `overallNote` through `sendFailureEmail`**

Replace:

```javascript
export async function sendFailureEmail(session, lineResults) {
  let recipients;
```

with:

```javascript
export async function sendFailureEmail(session, lineResults, overallNote) {
  let recipients;
```

Replace:

```javascript
        template_params: {
          to_email: recipients.join(","),
          subject: buildFailureSubject(session),
          message: buildFailureBody(session, lineResults),
        },
```

with:

```javascript
        template_params: {
          to_email: recipients.join(","),
          subject: buildFailureSubject(session),
          message: buildFailureBody(session, lineResults, overallNote),
        },
```

- [ ] **Step 4: Pass the note from `LiveTestRunnerPage.jsx`'s `finishSession()`**

Replace:

```javascript
    let failureEmail = { status: null, recipients: [], error: null };
    if (overallResult === RESULT.FAIL) {
      failureEmail = await sendFailureEmail(finishedSession, results);
    }
```

with:

```javascript
    let failureEmail = { status: null, recipients: [], error: null };
    if (overallResult === RESULT.FAIL) {
      failureEmail = await sendFailureEmail(finishedSession, results, testNoteRef.current ?? testNote);
    }
```

- [ ] **Step 5: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/notify.js web/src/pages/LiveTestRunnerPage.jsx
git commit -m "feat: include the test-level note in the failure email"
```

---

### Task 5: Show the note on `ResultsPage.jsx`

**Files:**
- Modify: `web/src/pages/ResultsPage.jsx`

**Interfaces:**
- Consumes: `sessions/{sessionId}/testNotes/main`; `buildFailureMailto` from Task 4 (new 4th argument).
- Produces: nothing new consumed by other files.

- [ ] **Step 1: Add `overallNote` state**

Replace:

```javascript
  const [session, setSession] = useState(null);
  const [lineResults, setLineResults] = useState([]);
  const [legacyMailto, setLegacyMailto] = useState(null);
```

with:

```javascript
  const [session, setSession] = useState(null);
  const [lineResults, setLineResults] = useState([]);
  const [legacyMailto, setLegacyMailto] = useState(null);
  // { exists, note, photoURLs } for the one test-level note. `exists` distinguishes a
  // post-fix session (testNotes/main doc present, shown as-is even if empty) from a
  // pre-fix session (no doc at all — falls back to the old last-line note below).
  const [overallNote, setOverallNote] = useState({ exists: true, note: "", photoURLs: [] });
```

- [ ] **Step 2: Fetch it alongside session/lineResults**

Replace:

```javascript
  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSession({ id: snap.id, ...snap.data() }));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then((snap) =>
      setLineResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [sessionId]);
```

with:

```javascript
  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSession({ id: snap.id, ...snap.data() }));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then((snap) =>
      setLineResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    getDoc(doc(db, "sessions", sessionId, "testNotes", "main")).then((snap) => {
      setOverallNote(snap.exists() ? { exists: true, ...snap.data() } : { exists: false, note: "", photoURLs: [] });
    });
  }, [sessionId]);
```

- [ ] **Step 3: Compute the display values with legacy fallback**

Replace:

```javascript
  if (!session) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  const passed = session.overallResult === RESULT.PASS;
```

with:

```javascript
  if (!session) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  // Sessions completed before the single-note fix shipped have no testNotes/main doc at all
  // (overallNote.exists === false) — their note lived on whichever line was last in the
  // template. Post-fix sessions always have the doc and are shown exactly as stored, even
  // if empty, so a legitimately-unrelated note on a post-fix template's last line (e.g.
  // Obstacle Course's aggressive-driving note) is never mistaken for this fallback.
  const lastLine = lineResults[lineResults.length - 1];
  const displayNote = overallNote.exists ? overallNote.note : lastLine?.note ?? "";
  const displayPhotos = overallNote.exists ? overallNote.photoURLs ?? [] : lastLine?.photoURLs ?? [];

  const passed = session.overallResult === RESULT.PASS;
```

- [ ] **Step 4: Pass the note into `buildFailureMailto`**

Replace:

```javascript
  const mailtoHref =
    recipients && recipients.length > 0 && lineResults.length > 0
      ? buildFailureMailto(recipients, session, lineResults)
      : legacyMailto;
```

with:

```javascript
  const mailtoHref =
    recipients && recipients.length > 0 && lineResults.length > 0
      ? buildFailureMailto(recipients, session, lineResults, { note: displayNote, photoURLs: displayPhotos })
      : legacyMailto;
```

- [ ] **Step 5: Render the note/photo card**

Replace:

```javascript
          {session.totalPointsPossible > 0 && (
            <p style={{ fontWeight: 600, marginTop: 8 }}>
              {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
              {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% —
              needed {session.passingPercentageSnapshot}% to pass)
            </p>
          )}
        </div>

        {!passed && (
```

with:

```javascript
          {session.totalPointsPossible > 0 && (
            <p style={{ fontWeight: 600, marginTop: 8 }}>
              {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
              {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% —
              needed {session.passingPercentageSnapshot}% to pass)
            </p>
          )}
        </div>

        {(displayNote || displayPhotos.length > 0) && (
          <div className="card" style={{ width: "100%", maxWidth: 400, marginTop: 8, textAlign: "left" }}>
            <strong style={{ fontSize: 14, color: "var(--text-secondary)" }}>Evaluator Notes</strong>
            {displayPhotos.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {displayPhotos.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginRight: 8 }}
                  />
                ))}
              </div>
            )}
            {displayNote && <p style={{ marginTop: 8, marginBottom: 0 }}>{displayNote}</p>}
          </div>
        )}

        {!passed && (
```

- [ ] **Step 6: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/ResultsPage.jsx
git commit -m "feat: show the test-level note and photos on the recruit results screen"
```

---

### Task 6: Show the note on `SessionDetailPage.jsx`, with legacy per-line de-duplication

**Files:**
- Modify: `web/src/pages/reporting/SessionDetailPage.jsx`

**Interfaces:**
- Consumes: `sessions/{sessionId}/testNotes/main` (same shape as Task 5).

- [ ] **Step 1: Add `overallNote` state**

Replace:

```javascript
  const [session, setSession] = useState(null);
  const [lineResults, setLineResults] = useState([]);
```

with:

```javascript
  const [session, setSession] = useState(null);
  const [lineResults, setLineResults] = useState([]);
  // Same { exists, note, photoURLs } shape as ResultsPage.jsx — see its comment for why
  // `exists` (not emptiness) is the fallback signal.
  const [overallNote, setOverallNote] = useState({ exists: true, note: "", photoURLs: [] });
```

- [ ] **Step 2: Fetch it alongside session/lineResults**

Replace:

```javascript
  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSession({ id: snap.id, ...snap.data() }));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then((snap) =>
      setLineResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [sessionId]);
```

with:

```javascript
  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSession({ id: snap.id, ...snap.data() }));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then((snap) =>
      setLineResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    getDoc(doc(db, "sessions", sessionId, "testNotes", "main")).then((snap) => {
      setOverallNote(snap.exists() ? { exists: true, ...snap.data() } : { exists: false, note: "", photoURLs: [] });
    });
  }, [sessionId]);
```

- [ ] **Step 3: Compute the display values with legacy fallback, right before the main render**

Replace:

```javascript
  return (
    <div className="app-shell">
      <TopBar title="Session Detail" onBack={() => navigate(-1)} showMenu={false} />
      <div className="screen">
```

with:

```javascript
  const lastLine = lineResults[lineResults.length - 1];
  const displayNote = overallNote.exists ? overallNote.note : lastLine?.note ?? "";
  const displayPhotos = overallNote.exists ? overallNote.photoURLs ?? [] : lastLine?.photoURLs ?? [];

  return (
    <div className="app-shell">
      <TopBar title="Session Detail" onBack={() => navigate(-1)} showMenu={false} />
      <div className="screen">
```

- [ ] **Step 4: Render the note/photo block in the summary card**

Replace:

```javascript
          {session.totalPointsPossible > 0 && (
            <div style={{ fontWeight: 600, marginTop: 6 }}>
              {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
              {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% — needed{" "}
              {session.passingPercentageSnapshot}% to pass)
            </div>
          )}
        </div>
```

with:

```javascript
          {session.totalPointsPossible > 0 && (
            <div style={{ fontWeight: 600, marginTop: 6 }}>
              {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
              {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% — needed{" "}
              {session.passingPercentageSnapshot}% to pass)
            </div>
          )}
          {(displayNote || displayPhotos.length > 0) && (
            <div className="muted" style={{ marginTop: 8, textAlign: "left" }}>
              <strong>Evaluator Notes:</strong>
              {displayPhotos.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {displayPhotos.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, marginRight: 6, marginTop: 4 }}
                    />
                  ))}
                </div>
              )}
              {displayNote && <p style={{ margin: "4px 0 0" }}>{displayNote}</p>}
            </div>
          )}
        </div>
```

- [ ] **Step 5: Suppress the duplicate legacy note in the per-line list**

Replace:

```javascript
        {lineResults.map((line) => {
          // The obstacle course's own summary already shows time/deductions/score, so skip
          // the duplicate generic title/time/points header for that step.
          const isObstacle = line.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE;
          return (
            <div key={line.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {!isObstacle && (
                    <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(line.lineTextSnapshot) }} />
                  )}
                </span>
                <span>
                  {line.result === RESULT.PASS && "✅"}
                  {line.result === RESULT.FAIL && "❌"}
                  {line.result === RESULT.NOT_APPLICABLE && "—"}
                </span>
              </div>
              {!isObstacle && (line.timerElapsedSeconds ?? line.elapsedSeconds) != null && (
                <div className="muted">{formatSeconds(line.timerElapsedSeconds ?? line.elapsedSeconds)}s</div>
              )}
              {!isObstacle && line.pointsSnapshot != null && (
                <div className="muted">{line.pointsEarned ?? 0} / {line.pointsSnapshot} pts</div>
              )}
              {line.totalPausedSeconds > 0 && (
                <div className="muted">Paused for {formatSeconds(line.totalPausedSeconds)}s</div>
              )}
              {(line.photoURLs ?? []).map((url) => (
                <img key={url} src={url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, marginTop: 6, marginRight: 6 }} />
              ))}
              {line.note && <div className="muted" style={{ marginTop: 4 }}>{line.note}</div>}
              {isObstacle && (
                <ObstacleCourseSummary config={line.obstacleCourseConfigSnapshot} tallies={line.obstacleTallies} />
              )}
            </div>
          );
        })}
```

with:

```javascript
        {lineResults.map((line) => {
          // The obstacle course's own summary already shows time/deductions/score, so skip
          // the duplicate generic title/time/points header for that step.
          const isObstacle = line.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE;
          // Pre-fix sessions (no testNotes/main doc) had their one overall-fail note sitting
          // on this exact line (whichever was last in the template) — already shown once via
          // the fallback in the summary card above, so skip it here to avoid a duplicate.
          // Post-fix sessions (overallNote.exists) never suppress: this line's own note is
          // always its own (e.g. Obstacle Course's separate aggressive-driving note).
          const isFallbackOverallNoteLine = !overallNote.exists && line.id === lastLine?.id;
          return (
            <div key={line.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {!isObstacle && (
                    <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(line.lineTextSnapshot) }} />
                  )}
                </span>
                <span>
                  {line.result === RESULT.PASS && "✅"}
                  {line.result === RESULT.FAIL && "❌"}
                  {line.result === RESULT.NOT_APPLICABLE && "—"}
                </span>
              </div>
              {!isObstacle && (line.timerElapsedSeconds ?? line.elapsedSeconds) != null && (
                <div className="muted">{formatSeconds(line.timerElapsedSeconds ?? line.elapsedSeconds)}s</div>
              )}
              {!isObstacle && line.pointsSnapshot != null && (
                <div className="muted">{line.pointsEarned ?? 0} / {line.pointsSnapshot} pts</div>
              )}
              {line.totalPausedSeconds > 0 && (
                <div className="muted">Paused for {formatSeconds(line.totalPausedSeconds)}s</div>
              )}
              {!isFallbackOverallNoteLine && (line.photoURLs ?? []).map((url) => (
                <img key={url} src={url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, marginTop: 6, marginRight: 6 }} />
              ))}
              {!isFallbackOverallNoteLine && line.note && (
                <div className="muted" style={{ marginTop: 4 }}>{line.note}</div>
              )}
              {isObstacle && (
                <ObstacleCourseSummary config={line.obstacleCourseConfigSnapshot} tallies={line.obstacleTallies} />
              )}
            </div>
          );
        })}
```

- [ ] **Step 6: Build check**

Run: `cd web && npm run build`
Expected: builds cleanly, no errors.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/reporting/SessionDetailPage.jsx
git commit -m "feat: show the test-level note and photos on Session Detail"
```

---

### Task 7: End-to-end verification and ship

**Files:** none (verification + git/GitHub only)

- [ ] **Step 1: Drive the app per the spec's Testing section**

Use the `GFD-Training-Practicals/web:verify` skill to start the emulator-backed harness (Firestore/Auth emulators + `VITE_USE_EMULATOR=1 npm run dev`, restarted since Task 1 to pick up the new rule), seed the admin login, then verify all nine scenarios from `docs/superpowers/specs/2026-07-19-single-test-notes-field-design.md`'s Testing section:

1. Start a live test, switch to Checklist view — the persistent Test Notes banner is visible and editable there.
2. Same check in Tile view.
3. Grade a multi-step template entirely through Checklist or Tile view (never opening Standard) so it computes to an overall FAIL — Submit is blocked by the "Note Required" modal exactly once, and typing a note there lets Submit proceed.
4. A note typed directly into the persistent banner *before* Submit satisfies the gate — the modal doesn't appear if a note is already present.
5. The per-line optional note/photo box no longer appears on any line card in Standard view (Graded, Timer, Obstacle Course).
6. After finishing a failed test, `ResultsPage.jsx` shows the note text and any attached photos (not just a photo count).
7. `SessionDetailPage.jsx` shows the same note/photos in its own summary block.
8. Open an already-completed session from before this fix shipped (a session created against `main` prior to this branch) and confirm both `ResultsPage.jsx` and `SessionDetailPage.jsx` still show that note via the fallback, with no duplicate rendering. If no such pre-fix session exists in the emulator's seed data, note this as untestable-in-this-environment rather than skipping silently.
9. Batch Grade's fail-note flow and Obstacle Course's aggressive-driving note flow are both unchanged.

- [ ] **Step 2: Push the branch and open a PR**

```bash
git push -u origin feat/single-test-notes-field
gh pr create --draft --title "Single test-level notes field, visible in every grading view" --body "$(cat <<'EOF'
## Summary
- Fixes the root cause of notes disappearing in Checklist/Tile grading: the "one note per test" rule was piggybacked onto whichever line happened to be last in the template, which only ever surfaced in Standard view.
- The note/photo is now a real field on the test itself (`sessions/{id}/testNotes/main`, staff-only), shown in a persistent banner visible from Standard, Checklist, and Tile alike, and still required (via the same "Note Required" modal) when the computed overall result is a FAIL.
- `ResultsPage.jsx` and `SessionDetailPage.jsx` now display this note/photos consistently; pre-existing sessions fall back to their old last-line note so nothing already recorded disappears.
- The failure-notification email now includes this note.
- Batch Grade and Obstacle Course's aggressive-driving note are unchanged (explicitly out of scope).

## Test plan
- [ ] Test Notes banner visible/editable in Standard, Checklist, and Tile
- [ ] Note Required modal still gates Submit exactly once on an overall FAIL, now writing to the session-level doc
- [ ] A note typed into the banner ahead of time satisfies the gate without the modal appearing
- [ ] Per-line note/photo box is gone from every Standard-view line card
- [ ] ResultsPage and SessionDetailPage both show the note/photos
- [ ] A pre-fix session still shows its old note via the fallback, with no duplicate
- [ ] Batch Grade and Obstacle Course aggressive-driving flows unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL to the user**

Do not merge or deploy without explicit user sign-off — this touches Firestore rules and a live grading flow, both real user-facing changes per this repo's established convention (see `docs/superpowers/handoffs/2026-07-19-session-handoff.md`).
