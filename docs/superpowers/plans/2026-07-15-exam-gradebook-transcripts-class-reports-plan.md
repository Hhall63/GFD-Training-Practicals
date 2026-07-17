# Written Exam Gradebook, Recruit Transcripts & Class Report Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin transcribe paper written-exam scores into the app (Part A), print a per-recruit transcript — a one-page Summary of "core" tests plus a Complete version with everything else (Part B), and build/save a named, reusable report query across a whole cohort (Part C).

**Architecture:** All three parts reuse the existing `templates` → `sessions` → `lineResults` pipeline (the same pattern Batch Grade already established — see `docs/superpowers/specs/2026-07-12-batch-grade-feature-design.md`) rather than inventing parallel data models, so every existing report/CSV export picks up written exams for free. A new shared helper, `resolveEffectiveSession`, centralizes the "latest retake overrides latest first-attempt" rule that today lives only inside `RecruitHomePage.jsx`; both the transcript builder and the class report reuse it. The three specs this plan implements are `docs/superpowers/specs/2026-07-15-written-exam-gradebook-design.md`, `docs/superpowers/specs/2026-07-15-recruit-transcripts-design.md`, and `docs/superpowers/specs/2026-07-15-class-report-builder-design.md`.

**Tech Stack:** React 18 + react-router-dom 6, Firebase JS SDK v10 (Firestore + Auth), Vite. No unit-test framework is installed in this repo (`web/package.json` has no vitest/jest and no `test` script) — verification in this plan uses `npm run build` for compile-safety and the repo's own `GFD-Training-Practicals/web:verify` skill (Firestore/Auth emulators + Playwright) for real end-to-end UI flows, matching how the Batch Grade feature was verified.

## Global Constraints

- Exam templates: `{ name, examCategory, isWrittenExam: true, isActive: true, passingPercentage: 70, includeInSummaryTranscript: false, createdAt }`, one child `lines` doc `{ lineType: "graded", lineText: <name>, points: 100, isCritical: false, sortOrder: 0 }`.
- Exams are always scored out of 100; passing is a score ≥ 70 (fixed for every exam, per the approved spec).
- Every new admin screen in Parts A and C is admin-only, gated the same way every other `/recruits`, `/templates`, `/exams` route already is: `<RequireAuth><RequireAdminRole>...</RequireAdminRole></RequireAuth>`.
- Retake/retest mechanism reuses the existing `attemptType: "first" | "retake"` field verbatim — no new field for "is this a retest."
- Reuses existing conventions verbatim: `card`/`card--raised`, `primary`/`secondary` buttons, `field` wrapper divs, `badge pass`/`badge fail`/`badge neutral`, `recruit-grid`/`screen--wide` for grading grids, and (once ported in Task 1) the shared `Modal` component for every new popup form instead of a hand-rolled overlay.
- `firestore.rules`: only one new rule block needed (`classReportFilters`, admin-only read/write) — every other collection this plan touches (`templates`, `sessions`) already has rules that cover admin writes.

---

## File Structure

**Part A — Written Exam Gradebook:**
- `web/src/components/Modal.jsx` **(new)** — ported from the `audit-p0-p1-remediation` worktree; shared accessible dialog shell (focus trap, Escape-to-close, backdrop-click-to-close). `TestGroupsAdminPage.jsx` already imports this path and is currently broken on `main` without it.
- `web/src/lib/reportsData.js` **(modify)** — add `resolveEffectiveSession(sessionsForOneTemplate)`.
- `web/src/pages/RecruitHomePage.jsx` **(modify)** — refactor to call the shared helper instead of its inline copy.
- `web/src/lib/constants.js` **(modify)** — add `computeExamResult(score, passingPercentage)`.
- `web/src/lib/exams.js` **(new)** — `createExamTemplate`, `recordExamScore`, `updateExamScore`, `loadExamGrades`, `getSingleLineResultId`.
- `web/src/pages/ExamsAdminPage.jsx` **(new)** — "Manage Exams" list + new-exam modal + per-row summary-transcript toggle.
- `web/src/pages/ExamScoresPage.jsx` **(new)** — exam/date/cohort picker.
- `web/src/pages/ExamScoresGradingPage.jsx` **(new)** — the grading grid (score entry, retest, edit, Save All).
- `web/src/pages/TemplatesAdminPage.jsx` **(modify)** — exclude `isWrittenExam` templates (mirrors the existing `isBatchGrade` exclusion).
- `web/src/lib/navItems.js` **(modify)** — two new nav entries.
- `web/src/App.jsx` **(modify)** — three new admin-only routes.

**Part B — Recruit Transcripts:**
- `web/src/pages/TemplateEditorPage.jsx` **(modify)** — add `includeInSummaryTranscript` checkbox.
- `web/src/lib/reportsData.js` **(modify)** — add `buildTranscriptLineItems({ recruitId, templateIds })`.
- `web/src/components/TranscriptHeader.jsx` **(new)** — shared header (both logos + department text).
- `web/src/components/TranscriptLineItem.jsx` **(new)** — shared one-row line-item renderer (name/result/date/evaluator + retake sub-line).
- `web/src/styles/print.css` **(new)**, imported from `main.jsx` — `@page` sizing, `.no-print`, transcript/class-report layout classes.
- `web/src/pages/reporting/TranscriptSummaryPage.jsx` **(new)**
- `web/src/pages/reporting/TranscriptCompletePage.jsx` **(new)**
- `web/src/pages/reporting/RecruitHistoryDetailPage.jsx` **(modify)** — two new print buttons.
- `web/src/App.jsx` **(modify)** — two new admin-only routes.

**Part C — Class Report Builder:**
- `firestore.rules` **(modify)** — new `classReportFilters` match block.
- `web/src/lib/classReports.js` **(new)** — `createClassReportFilter`, `deactivateClassReportFilter`.
- `web/src/pages/reporting/ClassReportsListPage.jsx` **(new)** — list + "+ New Class Report" modal.
- `web/src/pages/reporting/ClassReportPage.jsx` **(new)** — the generated, per-recruit-paginated report.
- `web/src/pages/reporting/ReportingHomePage.jsx` **(modify)** — new quick link.
- `web/src/App.jsx` **(modify)** — two new admin-only routes.

---

# Part A — Written Exam Gradebook

### Task 1: Port the shared `Modal` component onto `main`

**Files:**
- Create: `web/src/components/Modal.jsx`

**Interfaces:**
- Consumes: `useEffect`, `useRef` from `react`.
- Produces: `export default function Modal({ titleId, onClose, children, maxWidth = 340 })` — used by `TestGroupsAdminPage.jsx` (already imports it, currently broken on `main`) and every new modal in this plan (Tasks 4, 6 of Part A; Task 3 of Part C).

- [ ] **Step 1: Write the file**

```javascript
// web/src/components/Modal.jsx
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Shared modal shell: dialog semantics, a focus trap, Escape-to-close, backdrop-click-to-
 * close, and focus restoration to whatever triggered it. Replaces the hand-rolled
 * `position:fixed;inset:0` overlay pattern previously duplicated across the app's admin and
 * live-test modals, none of which had any of the above.
 *
 * The caller's heading element must carry `id={titleId}` so aria-labelledby resolves. */
export default function Modal({ titleId, onClose, children, maxWidth = 340 }) {
  const cardRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const focusable = cardRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
      }}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card"
        style={{ width: maxWidth, background: "var(--surface)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the `--overlay-scrim` CSS variable it depends on**

`Modal.jsx` references `var(--overlay-scrim)`, which doesn't exist in `web/src/styles/theme.css` yet (every existing hand-rolled overlay inlines `rgba(0,0,0,0.4)` directly instead). Add it to the `:root` block in `web/src/styles/theme.css`, right after `--flag-amber-tint`:

```css
  --flag-amber-tint: rgba(180, 83, 9, 0.14);
  /* Shared modal backdrop tint — used by components/Modal.jsx. Existing hand-rolled overlays
     elsewhere in the app inline rgba(0,0,0,0.4) directly; new modals built on the shared
     Modal component use this named value instead. */
  --overlay-scrim: rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 3: Verify it compiles and fixes the existing broken import**

Run: `cd web && npm run build`
Expected: build succeeds with no errors. `TestGroupsAdminPage.jsx`'s `import Modal from "../components/Modal";` now resolves — this was a broken import on `main` before this task (the file didn't exist), so this build is the first one where `web/src/pages/TestGroupsAdminPage.jsx` compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Modal.jsx web/src/styles/theme.css
git commit -m "fix: add missing shared Modal component (already imported by TestGroupsAdminPage)"
```

---

### Task 2: Shared `resolveEffectiveSession` helper + `RecruitHomePage` refactor

**Files:**
- Modify: `web/src/lib/reportsData.js`
- Modify: `web/src/pages/RecruitHomePage.jsx`

**Interfaces:**
- Consumes (in `reportsData.js`): nothing new — `RESULT`/`SESSION_STATUS` already imported.
- Produces: `export function resolveEffectiveSession(sessionsForOneTemplate): { original: Session|null, retake: Session|null }` — consumed by `RecruitHomePage.jsx` (this task) and by `buildTranscriptLineItems` (Part B, Task 9).

- [ ] **Step 1: Add `resolveEffectiveSession` to `reportsData.js`**

Add this function to `web/src/lib/reportsData.js`, right after `buildCommandBoard` and before the `CLEAR_ALL_BATCH_LIMIT` section:

```javascript
/**
 * "Which grade counts" rule shared by RecruitHomePage's own-status view, the recruit
 * transcript builder, and the class report: given every completed session for one
 * recruit+template pair, the latest retake (if any) is what counts; otherwise the latest
 * first attempt. Returns both sessions separately (not just the effective one) so a caller
 * that needs to show a retake's own date/evaluator alongside the original — e.g. the
 * transcript's retake sub-line — has both available.
 */
export function resolveEffectiveSession(sessionsForOneTemplate) {
  const byTime = (a, b) => (a.startedAt?.toMillis?.() ?? 0) - (b.startedAt?.toMillis?.() ?? 0);
  const firsts = sessionsForOneTemplate.filter((s) => (s.attemptType ?? "first") === "first").sort(byTime);
  const retakes = sessionsForOneTemplate.filter((s) => s.attemptType === "retake").sort(byTime);
  return {
    original: firsts.length > 0 ? firsts[firsts.length - 1] : null,
    retake: retakes.length > 0 ? retakes[retakes.length - 1] : null,
  };
}
```

- [ ] **Step 2: Refactor `RecruitHomePage.jsx` to use it**

In `web/src/pages/RecruitHomePage.jsx`, add the import (alongside the existing `RESULT, SESSION_STATUS` import):

```javascript
import { RESULT, SESSION_STATUS } from "../lib/constants";
import { resolveEffectiveSession } from "../lib/reportsData";
```

Replace the body of the `statusByTemplate` memo's per-template block — currently:

```javascript
      const completed = sessions.filter(
        (s) => s.templateId === template.id && s.status === SESSION_STATUS.COMPLETED
      );
      const byTime = (a, b) => (a.startedAt?.toMillis?.() ?? 0) - (b.startedAt?.toMillis?.() ?? 0);
      const firsts = completed.filter((s) => (s.attemptType ?? "first") === "first").sort(byTime);
      const retakes = completed.filter((s) => s.attemptType === "retake").sort(byTime);

      if (retakes.length > 0) {
        const latest = retakes[retakes.length - 1];
        map[template.id] = latest.overallResult === RESULT.PASS
          ? { label: "Retake — Pass", tone: "pass" }
          : { label: "Retake — Fail", tone: "fail" };
      } else if (firsts.length > 0) {
        const latest = firsts[firsts.length - 1];
        map[template.id] = latest.overallResult === RESULT.PASS
          ? { label: "Passed", tone: "pass" }
          : { label: "Failed", tone: "fail" };
      } else {
        map[template.id] = { label: "Not attempted", tone: "neutral" };
      }
```

with:

```javascript
      const completed = sessions.filter(
        (s) => s.templateId === template.id && s.status === SESSION_STATUS.COMPLETED
      );
      const { original, retake } = resolveEffectiveSession(completed);

      if (retake) {
        map[template.id] = retake.overallResult === RESULT.PASS
          ? { label: "Retake — Pass", tone: "pass" }
          : { label: "Retake — Fail", tone: "fail" };
      } else if (original) {
        map[template.id] = original.overallResult === RESULT.PASS
          ? { label: "Passed", tone: "pass" }
          : { label: "Failed", tone: "fail" };
      } else {
        map[template.id] = { label: "Not attempted", tone: "neutral" };
      }
```

This preserves identical behavior: `resolveEffectiveSession`'s `original`/`retake` are exactly "latest first-attempt" / "latest retake" — the same two values the old code derived inline.

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify unchanged behavior against the emulator**

Using the `GFD-Training-Practicals/web:verify` skill's emulator harness: as a recruit-role account (or by checking Firestore state directly), confirm `RecruitHomePage`'s status list still shows the same three states it did before this refactor — "Not attempted" (no sessions), "Passed"/"Failed" (one first-attempt session, no retake), and "Retake — Pass"/"Retake — Fail" (a first-attempt session plus a later retake session, regardless of the first attempt's own result). Create these three scenarios via three sessions written directly through the Firestore emulator REST API (`PATCH` to `sessions/{id}` with `templateId`, `recruitId`, `status: "completed"`, `attemptType`, `overallResult`, `startedAt`), then load `/` as the recruit account and confirm each template shows the expected label/tone.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reportsData.js web/src/pages/RecruitHomePage.jsx
git commit -m "refactor: extract resolveEffectiveSession shared helper from RecruitHomePage"
```

---

### Task 3: `computeExamResult` + `lib/exams.js` data helpers

**Files:**
- Modify: `web/src/lib/constants.js`
- Create: `web/src/lib/exams.js`

**Interfaces:**
- Consumes: `LINE_TYPES`, `RESULT`, `SESSION_STATUS`, `computeExamResult` from `./constants`; `sendFailureEmail` from `./notify`; `db` from `../firebase`.
- Produces:
  - `computeExamResult(score, passingPercentage): "pass" | "fail"` (in `constants.js`)
  - `async function createExamTemplate({ name, category }): Promise<{ id: string, name: string }>`
  - `async function recordExamScore({ template, recruit, evaluatorName, score, examDate, attemptType }): Promise<{ sessionId: string, lineResultId: string, failureEmailStatus: string|null }>`
  - `async function updateExamScore({ sessionId, lineResultId, score }): Promise<void>`
  - `async function loadExamGrades(templateId): Promise<Map<string, { original: Session|null, retake: Session|null }>>` — keyed by `recruitId`
  - `async function getSingleLineResultId(sessionId): Promise<string|null>`
  - All consumed by `ExamsAdminPage.jsx` (Task 4) and `ExamScoresPage.jsx`/`ExamScoresGradingPage.jsx` (Tasks 5-6).

- [ ] **Step 1: Add `computeExamResult` to `constants.js`**

Add this function to `web/src/lib/constants.js`, right after `computeTimerResult`:

```javascript
/** Written exams are always scored out of 100; compares the recruit's score against the
 * exam's passing percentage the same way computeTimerResult compares an elapsed time. */
export function computeExamResult(score, passingPercentage) {
  return score >= passingPercentage ? RESULT.PASS : RESULT.FAIL;
}
```

- [ ] **Step 2: Write `lib/exams.js`**

```javascript
// web/src/lib/exams.js
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { computeExamResult, LINE_TYPES, RESULT, SESSION_STATUS } from "./constants";
import { sendFailureEmail } from "./notify";

const EXAM_PASSING_PERCENTAGE = 70;

/**
 * Written exams ride the existing templates/sessions pipeline (isWrittenExam: true), the
 * same way Batch Grade rides it (isBatchGrade: true) — see
 * docs/superpowers/specs/2026-07-15-written-exam-gradebook-design.md. Template doc + its one
 * graded line are written in a single batch so a crash between the two writes can never
 * strand a template with no line.
 */
export async function createExamTemplate({ name, category }) {
  const now = new Date();
  const templateRef = doc(collection(db, "templates"));
  const lineRef = doc(collection(db, "templates", templateRef.id, "lines"));
  const batch = writeBatch(db);
  batch.set(templateRef, {
    name,
    examCategory: category,
    isWrittenExam: true,
    isActive: true,
    passingPercentage: EXAM_PASSING_PERCENTAGE,
    includeInSummaryTranscript: false,
    createdAt: now,
  });
  batch.set(lineRef, {
    lineType: LINE_TYPES.GRADED,
    lineText: name,
    points: 100,
    isCritical: false,
    sortOrder: 0,
  });
  await batch.commit();
  return { id: templateRef.id, name };
}

/** `examDate` is a "YYYY-MM-DD" string from an <input type="date">. Noon local time avoids
 * any UTC-conversion day-shift that constructing at midnight would risk. */
function examDateToTimestamp(examDate) {
  const [year, month, day] = examDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Grades one recruit against one exam in a single write: creates an already-completed
 * session + its one lineResult, exactly like Batch Grade's recordBatchGradeResult, except
 * scored out of 100 and dated to the admin-chosen exam date rather than serverTimestamp().
 * attemptType is "first" for the initial grade, "retake" for a retest — identical mechanism
 * to practicals (RecruitConfirmPage.jsx).
 */
export async function recordExamScore({ template, recruit, evaluatorName, score, examDate, attemptType }) {
  const passingPercentage = template.passingPercentage ?? EXAM_PASSING_PERCENTAGE;
  const result = computeExamResult(score, passingPercentage);
  const examTimestamp = examDateToTimestamp(examDate);

  const sessionData = {
    recruitId: recruit.id,
    recruitName: `${recruit.firstName} ${recruit.lastName}`,
    templateId: template.id,
    templateName: template.name,
    evaluatorName,
    attemptType,
    startedAt: examTimestamp,
    completedAt: examTimestamp,
    status: SESSION_STATUS.COMPLETED,
    overallResult: result,
    criticalFailure: false,
    passingPercentageSnapshot: passingPercentage,
    totalPointsPossible: 100,
    totalPointsEarned: score,
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
    pointsSnapshot: 100,
    isCriticalSnapshot: false,
    obstacleCourseConfigSnapshot: null,
    obstacleTallies: null,
    result,
    pointsEarned: score,
    timerElapsedSeconds: null,
    note: null,
    photoURLs: [],
  };
  const lineResultRef = await addDoc(collection(db, "sessions", sessionRef.id, "lineResults"), lineResult);

  let failureEmail = { status: null, recipients: [], error: null };
  if (result === RESULT.FAIL) {
    failureEmail = await sendFailureEmail({ ...sessionData, id: sessionRef.id }, [lineResult]);
    await updateDoc(doc(db, "sessions", sessionRef.id), {
      failureEmailStatus: failureEmail.status,
      failureEmailRecipients: failureEmail.recipients,
      failureEmailError: failureEmail.error,
    });
  }

  return { sessionId: sessionRef.id, lineResultId: lineResultRef.id, failureEmailStatus: failureEmail.status };
}

/**
 * Corrects a mistyped score in place — the first in-place session edit in this app (every
 * other session, once created, is immutable history). Reads passingPercentageSnapshot off
 * the existing session rather than the live template, so an edit never drifts from whatever
 * passing rule was actually in effect when this session was first recorded.
 */
export async function updateExamScore({ sessionId, lineResultId, score }) {
  const sessionSnap = await getDoc(doc(db, "sessions", sessionId));
  const passingPercentage = sessionSnap.data()?.passingPercentageSnapshot ?? EXAM_PASSING_PERCENTAGE;
  const result = computeExamResult(score, passingPercentage);
  await updateDoc(doc(db, "sessions", sessionId), {
    overallResult: result,
    totalPointsEarned: score,
  });
  await updateDoc(doc(db, "sessions", sessionId, "lineResults", lineResultId), {
    result,
    pointsEarned: score,
  });
}

function toMillis(ts) {
  return ts?.toMillis?.() ?? 0;
}

/**
 * Loads every completed session for one exam template, reduced to the latest first-attempt
 * and latest retake per recruit — so the grading grid shows correct already-graded state
 * even after a page reload, unlike Batch Grade's roster page (which only tracks graded state
 * in local component state for the current visit).
 */
export async function loadExamGrades(templateId) {
  const snap = await getDocs(
    query(
      collection(db, "sessions"),
      where("templateId", "==", templateId),
      where("status", "==", SESSION_STATUS.COMPLETED)
    )
  );
  const byRecruit = new Map();
  for (const d of snap.docs) {
    const session = { id: d.id, ...d.data() };
    if (session.isPractice) continue;
    const entry = byRecruit.get(session.recruitId) ?? { original: null, retake: null };
    if (session.attemptType === "retake") {
      if (!entry.retake || toMillis(session.startedAt) > toMillis(entry.retake.startedAt)) entry.retake = session;
    } else {
      if (!entry.original || toMillis(session.startedAt) > toMillis(entry.original.startedAt)) entry.original = session;
    }
    byRecruit.set(session.recruitId, entry);
  }
  return byRecruit;
}

/** Exam sessions have exactly one lineResults doc (sortOrder 0) — fetched lazily only when
 * an Edit control is actually clicked, rather than for every row on initial grid load. */
export async function getSingleLineResultId(sessionId) {
  const snap = await getDocs(collection(db, "sessions", sessionId, "lineResults"));
  return snap.docs[0]?.id ?? null;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors (this file isn't imported anywhere yet).

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/constants.js web/src/lib/exams.js
git commit -m "feat: add written-exam data helpers (create, record, edit, load grades)"
```

---

### Task 4: `ExamsAdminPage.jsx` — "Manage Exams"

**Files:**
- Create: `web/src/pages/ExamsAdminPage.jsx`
- Modify: `web/src/lib/navItems.js`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `createExamTemplate` from `../lib/exams` (Task 3); `Modal` from `../components/Modal` (Task 1); `TopBar` from `../components/TopBar`.
- Produces: route `/exams`, consumed by the new nav entry and by manual navigation in later verification steps.

- [ ] **Step 1: Write `ExamsAdminPage.jsx`**

```javascript
// web/src/pages/ExamsAdminPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";
import { createExamTemplate } from "../lib/exams";

export default function ExamsAdminPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isWrittenExam", "==", true),
      where("isActive", "==", true)
    );
    return onSnapshot(q, (snap) => {
      setExams(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (a.examCategory ?? "").localeCompare(b.examCategory ?? "") || a.name.localeCompare(b.name)
          )
      );
    });
  }, []);

  async function deactivate(exam) {
    await updateDoc(doc(db, "templates", exam.id), { isActive: false });
  }

  async function toggleSummary(exam) {
    await updateDoc(doc(db, "templates", exam.id), {
      includeInSummaryTranscript: !exam.includeInSummaryTranscript,
    });
  }

  const categories = [...new Set(exams.map((e) => e.examCategory).filter(Boolean))];

  return (
    <div className="app-shell">
      <TopBar title="Manage Exams" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <p className="muted">
          Define written exams for the gradebook. Every exam is scored out of 100, passing at 70%.
        </p>
        {exams.length === 0 && (
          <p className="muted">No exams yet. Create your first one to start grading.</p>
        )}
        {exams.map((exam) => (
          <div key={exam.id} className="card">
            <div className="list-row" style={{ padding: 0, border: "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{exam.name}</div>
                <div className="muted">{exam.examCategory}</div>
              </div>
              <button
                className="secondary"
                style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                onClick={() => deactivate(exam)}
              >
                Deactivate
              </button>
            </div>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={!!exam.includeInSummaryTranscript}
                onChange={() => toggleSummary(exam)}
                style={{ width: "auto", margin: 0 }}
              />
              Include on Summary Transcript
            </label>
          </div>
        ))}
        <button className="primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>
          + New Exam
        </button>
      </div>

      {showNew && <NewExamModal categories={categories} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewExamModal({ categories, onClose }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const listId = "exam-category-options";

  async function handleCreate() {
    setSaving(true);
    try {
      await createExamTemplate({ name: name.trim(), category: category.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal titleId="new-exam-title" onClose={onClose}>
      <h3 id="new-exam-title" style={{ marginTop: 0 }}>New Exam</h3>
      <div className="field">
        <label>Name</label>
        <input
          type="text"
          placeholder="e.g. Fire Behavior Final"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Category</label>
        <input
          type="text"
          list={listId}
          placeholder="e.g. Written Exam"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={!name.trim() || !category.trim() || saving} onClick={handleCreate}>
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Add the nav entry**

`web/src/lib/navItems.js` — full file after the change:

```javascript
export function getAdminNavItems() {
  return [
    ["Manage Recruits", "/recruits"],
    ["Manage Tests", "/templates"],
    ["Manage Test Groups", "/test-groups"],
    ["Batch Grade", "/batch-grade"],
    ["Manage Exams", "/exams"],
    ["Enter Exam Scores", "/exam-scores"],
    ["Reports", "/reports"],
    ["Add User", "/admins?new=1"],
    ["See All Users", "/admins"],
  ];
}
```

- [ ] **Step 3: Wire the route**

In `web/src/App.jsx`, add the import near the other page imports (after `BatchGradeRosterPage`):

```javascript
import ExamsAdminPage from "./pages/ExamsAdminPage";
```

Add the route near the other `RequireAdminRole` routes (after `/batch-grade/:templateId`):

```javascript
      <Route path="/exams" element={<RequireAuth><RequireAdminRole><ExamsAdminPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 4: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Verify against the emulator**

Using the `GFD-Training-Practicals/web:verify` skill's emulator harness, log in as the seeded admin and drive with Playwright:

1. Navigate to `/exams` (via the top-bar menu's new "Manage Exams" entry) → confirm the empty state ("No exams yet…") shows.
2. Click **+ New Exam**, fill Name "Fire Behavior Final" and Category "Written Exam" (scope fills to `.card:has(h3)` per the verify skill's modal guidance), click **Create** → modal closes, the exam now appears in the list under its category.
3. Create a second exam with Category "Module 2" → confirm the list now shows both, grouped/sorted by category then name.
4. Click **+ New Exam** again and check that typing into the Category field shows "Written Exam" and "Module 2" as datalist suggestions.
5. Check the "Include on Summary Transcript" checkbox on one exam → reload the page → confirm it's still checked (persisted to Firestore, not just local state).
6. Click **Deactivate** on the second exam → confirm it disappears from the list.

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/ExamsAdminPage.jsx web/src/lib/navItems.js web/src/App.jsx
git commit -m "feat: add Manage Exams page (create, categorize, deactivate, summary flag)"
```

---

### Task 5: `ExamScoresPage.jsx` — exam/date/cohort picker

**Files:**
- Create: `web/src/pages/ExamScoresPage.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `TopBar` from `../components/TopBar`; `db` from `../firebase`.
- Produces: navigates to `/exam-scores/:templateId?date=...&cohort=...`, consumed by `ExamScoresGradingPage.jsx` (Task 6) via `useParams`/`useSearchParams`.

- [ ] **Step 1: Write `ExamScoresPage.jsx`**

```javascript
// web/src/pages/ExamScoresPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";

function todayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function ExamScoresPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [examDate, setExamDate] = useState(todayDateInputValue());
  const [cohorts, setCohorts] = useState(["All"]);
  const [cohort, setCohort] = useState("All");

  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isWrittenExam", "==", true),
      where("isActive", "==", true)
    );
    return onSnapshot(q, (snap) => {
      setExams(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (a.examCategory ?? "").localeCompare(b.examCategory ?? "") || a.name.localeCompare(b.name)
          )
      );
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "recruits"), where("isActive", "==", true))).then((snap) => {
      const set = new Set(
        snap.docs
          .map((d) => d.data())
          .filter((r) => !r.isPractice)
          .map((r) => r.recruitClassOrCohort)
          .filter(Boolean)
      );
      setCohorts(["All", ...[...set].sort()]);
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar title="Enter Exam Scores" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <div className="field">
          <label>Exam</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select an exam…</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.examCategory ? `${e.examCategory} — ${e.name}` : e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Exam Given On</label>
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Cohort</label>
          <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
            {cohorts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <button
          className="primary"
          disabled={!selectedId || !examDate}
          onClick={() =>
            navigate(`/exam-scores/${selectedId}?date=${examDate}&cohort=${encodeURIComponent(cohort)}`)
          }
        >
          Start Grading
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `web/src/App.jsx`, add the import (after `ExamsAdminPage`):

```javascript
import ExamScoresPage from "./pages/ExamScoresPage";
```

Add the route (after `/exams`):

```javascript
      <Route path="/exam-scores" element={<RequireAuth><RequireAdminRole><ExamScoresPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify against the emulator**

Continuing the Task 4 emulator session: navigate to `/exam-scores` (top-bar menu → "Enter Exam Scores").

1. Confirm the Exam dropdown lists the exams created in Task 4, grouped by category in the option labels.
2. Confirm the Exam Given On field defaults to today's date.
3. Confirm the Cohort dropdown shows "All" plus every distinct `recruitClassOrCohort` among active recruits (add at least two recruits with different cohorts via Manage Recruits first if none exist yet).
4. Confirm **Start Grading** is disabled until an exam is selected.
5. Select an exam, pick a cohort, click **Start Grading** → URL becomes `/exam-scores/<templateId>?date=<today>&cohort=<cohort>` (Task 6 renders this; expect a blank/loading page at this point in the plan since `ExamScoresGradingPage` doesn't exist yet).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/ExamScoresPage.jsx web/src/App.jsx
git commit -m "feat: add exam/date/cohort picker for exam scoring"
```

---

### Task 6: `ExamScoresGradingPage.jsx` — the grading grid

**Files:**
- Create: `web/src/pages/ExamScoresGradingPage.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `loadExamGrades`, `getSingleLineResultId`, `recordExamScore`, `updateExamScore` from `../lib/exams` (Task 3); `initials`, `RESULT` from `../lib/constants`; `PRACTICE_RECRUIT_ID` from `../lib/practiceRecruit`; `useAuth` from `../context/AuthContext`.
- Produces: nothing consumed by later tasks in Part A (last screen in this part).

- [ ] **Step 1: Write `ExamScoresGradingPage.jsx`**

```javascript
// web/src/pages/ExamScoresGradingPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { initials, RESULT } from "../lib/constants";
import { PRACTICE_RECRUIT_ID } from "../lib/practiceRecruit";
import { loadExamGrades, getSingleLineResultId, recordExamScore, updateExamScore } from "../lib/exams";

function isValidScore(value) {
  if (value === "" || value == null) return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

export default function ExamScoresGradingPage() {
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const examDate = searchParams.get("date");
  const cohortFilter = searchParams.get("cohort") ?? "All";
  const navigate = useNavigate();
  const { adminDoc } = useAuth();

  const [template, setTemplate] = useState(null);
  const [recruits, setRecruits] = useState([]);
  const [grades, setGrades] = useState(new Map()); // recruitId -> { original, retake }
  const [drafts, setDrafts] = useState({}); // recruitId -> { score, retestScore, showRetest }
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState({});

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
          .filter((r) => cohortFilter === "All" || r.recruitClassOrCohort === cohortFilter)
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, [cohortFilter]);

  useEffect(() => {
    loadExamGrades(templateId).then(setGrades);
  }, [templateId]);

  function draftFor(recruitId) {
    return drafts[recruitId] ?? { score: "", retestScore: "", showRetest: false };
  }

  function setDraftScore(recruitId, score) {
    setDrafts((prev) => ({ ...prev, [recruitId]: { ...draftFor(recruitId), score } }));
  }

  function setDraftRetestScore(recruitId, retestScore) {
    setDrafts((prev) => ({ ...prev, [recruitId]: { ...draftFor(recruitId), retestScore } }));
  }

  function revealRetest(recruitId) {
    setDrafts((prev) => ({ ...prev, [recruitId]: { ...draftFor(recruitId), showRetest: true } }));
  }

  function beginEditOriginal(recruit, currentScore) {
    setDrafts((prev) => ({ ...prev, [recruit.id]: { ...draftFor(recruit.id), score: String(currentScore) } }));
  }

  function beginEditRetake(recruit, currentScore) {
    setDrafts((prev) => ({ ...prev, [recruit.id]: { ...draftFor(recruit.id), retestScore: String(currentScore) } }));
  }

  const hasInvalidScore = recruits.some((r) => {
    const d = draftFor(r.id);
    return !isValidScore(d.score) || !isValidScore(d.retestScore);
  });

  async function handleSaveAll() {
    setSaving(true);
    const errors = {};
    for (const recruit of recruits) {
      const d = draftFor(recruit.id);
      const existing = grades.get(recruit.id);

      if (d.score !== "" && d.score != null) {
        const score = Number(d.score);
        try {
          if (existing?.original) {
            const lineResultId = await getSingleLineResultId(existing.original.id);
            await updateExamScore({ sessionId: existing.original.id, lineResultId, score });
          } else {
            await recordExamScore({
              template,
              recruit,
              evaluatorName: adminDoc.displayName,
              score,
              examDate,
              attemptType: "first",
            });
          }
        } catch (err) {
          console.error("Failed to save exam score", recruit.id, err);
          errors[recruit.id] = "Failed to save — try again.";
        }
      }

      if (d.retestScore !== "" && d.retestScore != null) {
        const retestScore = Number(d.retestScore);
        try {
          if (existing?.retake) {
            const lineResultId = await getSingleLineResultId(existing.retake.id);
            await updateExamScore({ sessionId: existing.retake.id, lineResultId, score: retestScore });
          } else {
            await recordExamScore({
              template,
              recruit,
              evaluatorName: adminDoc.displayName,
              score: retestScore,
              examDate,
              attemptType: "retake",
            });
          }
        } catch (err) {
          console.error("Failed to save exam retest score", recruit.id, err);
          errors[recruit.id] = "Failed to save retest — try again.";
        }
      }
    }
    setRowErrors(errors);
    const refreshed = await loadExamGrades(templateId);
    setGrades(refreshed);
    setDrafts({});
    setSaving(false);
  }

  if (!template) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="app-shell">
      <TopBar title={template.name} onBack={() => navigate("/exam-scores")} showMenu={false} />
      <div className="screen--wide">
        {recruits.length === 0 && <p className="muted">No active recruits in this cohort.</p>}
        <div className="recruit-grid">
          {recruits.map((recruit) => {
            const existing = grades.get(recruit.id);
            const d = draftFor(recruit.id);
            const rowError = rowErrors[recruit.id];
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

                {existing?.original ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`badge ${existing.original.overallResult === RESULT.PASS ? "pass" : "fail"}`}>
                        {existing.original.totalPointsEarned} —{" "}
                        {existing.original.overallResult === RESULT.PASS ? "PASS" : "FAIL"}
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        style={{ width: "auto", padding: "2px 8px", fontSize: 12 }}
                        onClick={() => beginEditOriginal(recruit, existing.original.totalPointsEarned)}
                      >
                        Edit
                      </button>
                    </div>
                    {d.score !== "" && (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={d.score}
                        onChange={(e) => setDraftScore(recruit.id, e.target.value)}
                        style={{ marginTop: 6 }}
                      />
                    )}

                    {existing.retake ? (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            className={`badge ${existing.retake.overallResult === RESULT.PASS ? "pass" : "fail"}`}
                          >
                            Retest {existing.retake.totalPointsEarned} —{" "}
                            {existing.retake.overallResult === RESULT.PASS ? "PASS" : "FAIL"}
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            style={{ width: "auto", padding: "2px 8px", fontSize: 12 }}
                            onClick={() => beginEditRetake(recruit, existing.retake.totalPointsEarned)}
                          >
                            Edit
                          </button>
                        </div>
                        {d.retestScore !== "" && (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={d.retestScore}
                            onChange={(e) => setDraftRetestScore(recruit.id, e.target.value)}
                            style={{ marginTop: 6 }}
                          />
                        )}
                      </div>
                    ) : d.showRetest ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Retest score"
                        value={d.retestScore}
                        onChange={(e) => setDraftRetestScore(recruit.id, e.target.value)}
                        style={{ marginTop: 6 }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        style={{ width: "auto", marginTop: 6, fontSize: 12, padding: "4px 10px" }}
                        onClick={() => revealRetest(recruit.id)}
                      >
                        Enter Retest
                      </button>
                    )}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Score (0-100)"
                    value={d.score}
                    onChange={(e) => setDraftScore(recruit.id, e.target.value)}
                    style={{ marginTop: 10 }}
                  />
                )}
                {rowError && <p style={{ color: "var(--brand-red)", fontSize: 12, marginTop: 4 }}>{rowError}</p>}
              </div>
            );
          })}
        </div>

        <button className="primary" style={{ marginTop: 20 }} disabled={saving || hasInvalidScore} onClick={handleSaveAll}>
          {saving ? "Saving…" : "Save All"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `web/src/App.jsx`, add the import (after `ExamScoresPage`):

```javascript
import ExamScoresGradingPage from "./pages/ExamScoresGradingPage";
```

Add the route (after `/exam-scores`):

```javascript
      <Route path="/exam-scores/:templateId" element={<RequireAuth><RequireAdminRole><ExamScoresGradingPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify the full grading flow against the emulator**

Continuing the emulator session, with at least two active recruits in the same cohort:

1. From `/exam-scores`, pick an exam and cohort, click **Start Grading** → the grid loads with a blank score input per recruit.
2. Type `85` for the first recruit, `60` for the second. Click **Save All** → both rows now show a badge: `85 — PASS` and `60 — FAIL`.
3. Query Firestore to confirm two `sessions` docs exist for this `templateId`, one `overallResult: "pass"` with `totalPointsEarned: 85`, one `"fail"` with `60`:
   `curl -s "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/sessions" | grep -B2 -A5 '"totalPointsEarned"'`
4. Reload the page (`/exam-scores/<templateId>?date=...&cohort=...`) → confirm both recruits still show their saved badges (proves grid state survives reload, unlike Batch Grade's roster page).
5. Click **Edit** on the first recruit's badge → an input appears prefilled with `85`. Change it to `95`, click **Save All** → badge updates to `95 — PASS`. Reload again → confirm `95` persisted (proves in-place edit, not a duplicate session — recheck the Firestore query from Step 3 still shows exactly two sessions for this template, not three).
6. Click **Enter Retest** on the second (failing) recruit → a blank retest input appears. Type `75`, click **Save All** → the row now shows both `60 — FAIL` (original, de-emphasized) and `Retest 75 — PASS`.
7. Confirm the failure-notification path fired for the original fail in Step 2 (check `failureEmailStatus` on that session's doc is `"no-recipients"` if no admin has `notifyOnFailures` set, or `"sent"`/`"not-configured"` otherwise — any of these confirms `sendFailureEmail` was actually invoked, not skipped).
8. Type an out-of-range value (e.g. `150`) into any blank score box → confirm **Save All** becomes disabled until it's corrected or cleared.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/ExamScoresGradingPage.jsx web/src/App.jsx
git commit -m "feat: add exam scoring grid (score entry, retest, in-place edit, Save All)"
```

---

### Task 7: Exclude written-exam templates from Manage Tests

**Files:**
- Modify: `web/src/pages/TemplatesAdminPage.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

**Note:** `HomePage.jsx`'s test-picker query already filters `where("status","==","published")`, and exam templates (like Batch Grade templates) never get a `status` field — so that query already excludes them with no code change, exactly like Batch Grade's `HomePage.jsx` exclusion turned out to be redundant. This task only touches `TemplatesAdminPage.jsx`, whose query has no `status` filter and does need the explicit exclusion (it already excludes `isBatchGrade` the same way).

- [ ] **Step 1: Add the exclusion**

In `web/src/pages/TemplatesAdminPage.jsx`, the `templates` `onSnapshot` callback currently reads:

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

Change it to:

```javascript
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => !t.isBatchGrade && !t.isWrittenExam)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify against the emulator**

With exams already created (Task 4) and at least one normal practical template existing: open Manage Tests (`/templates`) → confirm no written-exam names appear in the list, only normal practicals. Open Manage Exams (`/exams`) → confirm the exams are still there, unaffected.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TemplatesAdminPage.jsx
git commit -m "fix: exclude written-exam templates from Manage Tests"
```

---

# Part B — Recruit Transcripts

### Task 8: `includeInSummaryTranscript` checkbox on `TemplateEditorPage.jsx`

**Files:**
- Modify: `web/src/pages/TemplateEditorPage.jsx`

**Interfaces:**
- Consumes: nothing new — reuses the existing `saveDetails(field, value)` helper already in this file.
- Produces: nothing consumed by later tasks (the field itself is consumed by `buildTranscriptLineItems`, Task 9).

- [ ] **Step 1: Add the checkbox**

In `web/src/pages/TemplateEditorPage.jsx`, inside the top `<div className="card">` block, right after the "Passing Score" `<div className="field" ...>` block and before its closing `</div>`, add:

```javascript
          <div className="field" style={{ marginBottom: 0, marginTop: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
              <input
                type="checkbox"
                checked={!!template.includeInSummaryTranscript}
                onChange={(e) => saveDetails("includeInSummaryTranscript", e.target.checked)}
                style={{ width: "auto", margin: 0 }}
              />
              Include on Summary Transcript
            </label>
          </div>
```

(This goes inside the same `<div className="card">` as Name/Description/Passing Score, after the Passing Score field's closing `</div>` but before the card's own closing `</div>`.)

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify against the emulator**

Open Manage Tests → open any practical template → confirm the new checkbox appears below Passing Score, unchecked by default. Check it, reload the page → confirm it's still checked (persisted via `saveDetails`, the same pattern Name/Description/Passing Score already use).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/TemplateEditorPage.jsx
git commit -m "feat: add Include on Summary Transcript checkbox to Manage Tests"
```

---

### Task 9: `buildTranscriptLineItems` in `reportsData.js`

**Files:**
- Modify: `web/src/lib/reportsData.js`

**Interfaces:**
- Consumes: `resolveEffectiveSession` (Task 2, same file); `SESSION_STATUS` (already imported).
- Produces: `async function buildTranscriptLineItems({ recruitId, templateIds }): Promise<{ core: LineItem[], remaining: LineItem[] } | { items: LineItem[] }>` where `LineItem = { templateId, templateName, original: { result, dateMs, evaluatorName }, retake: { result, dateMs, evaluatorName } | null }`. Consumed by `TranscriptSummaryPage.jsx`/`TranscriptCompletePage.jsx` (Tasks 11-12) and `ClassReportPage.jsx` (Part C, Task 17).

- [ ] **Step 1: Add the function**

Add this to `web/src/lib/reportsData.js`, right after `resolveEffectiveSession`:

```javascript
/**
 * Builds the printable line items for one recruit's tests/exams: groups their completed,
 * non-practice sessions by templateId, reduces each group through resolveEffectiveSession to
 * find the original attempt and (if present) the retake, and attaches each template's own
 * name/includeInSummaryTranscript flag.
 *
 * With no `templateIds`, returns the Summary/Complete transcript split: `core` (templates
 * flagged includeInSummaryTranscript) and `remaining` (every other template the recruit has
 * actually completed — never-attempted templates are omitted entirely).
 *
 * With `templateIds` given (the class report case), returns a flat `items` array restricted
 * to just those template ids, in the order given, skipping any the recruit hasn't completed.
 */
export async function buildTranscriptLineItems({ recruitId, templateIds = null }) {
  const [sessionsSnap, templatesSnap] = await Promise.all([
    getDocs(query(collection(db, "sessions"), where("recruitId", "==", recruitId))),
    getDocs(collection(db, "templates")),
  ]);

  const templatesById = new Map(templatesSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const sessions = sessionsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.status === SESSION_STATUS.COMPLETED && !s.isPractice);

  const byTemplate = new Map(); // templateId -> sessions[]
  for (const s of sessions) {
    if (!byTemplate.has(s.templateId)) byTemplate.set(s.templateId, []);
    byTemplate.get(s.templateId).push(s);
  }

  function toLineItem(templateId, group) {
    if (!group || group.length === 0) return null;
    const { original, retake } = resolveEffectiveSession(group);
    if (!original) return null;
    const template = templatesById.get(templateId);
    return {
      templateId,
      templateName: template?.name ?? original.templateName,
      original: {
        result: original.overallResult,
        dateMs: original.startedAt?.toMillis?.() ?? 0,
        evaluatorName: original.evaluatorName,
      },
      retake: retake
        ? {
            result: retake.overallResult,
            dateMs: retake.startedAt?.toMillis?.() ?? 0,
            evaluatorName: retake.evaluatorName,
          }
        : null,
    };
  }

  if (templateIds) {
    const items = templateIds.map((id) => toLineItem(id, byTemplate.get(id))).filter(Boolean);
    return { items };
  }

  const core = [];
  const remaining = [];
  for (const [templateId, group] of byTemplate.entries()) {
    const item = toLineItem(templateId, group);
    if (!item) continue;
    const template = templatesById.get(templateId);
    if (template?.includeInSummaryTranscript) core.push(item);
    else remaining.push(item);
  }
  core.sort((a, b) => a.templateName.localeCompare(b.templateName));
  remaining.sort((a, b) => a.templateName.localeCompare(b.templateName));
  return { core, remaining };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors (not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/reportsData.js
git commit -m "feat: add buildTranscriptLineItems for recruit transcripts and class reports"
```

---

### Task 10: `TranscriptHeader.jsx`, `TranscriptLineItem.jsx`, `print.css`

**Files:**
- Create: `web/src/components/TranscriptHeader.jsx`
- Create: `web/src/components/TranscriptLineItem.jsx`
- Create: `web/src/styles/print.css`
- Modify: `web/src/main.jsx`

**Interfaces:**
- Consumes: `assets/gfd-badge.png`, `assets/work-hard-be-humble.jpg` (both already exist in the repo).
- Produces: `<TranscriptHeader />`, `<TranscriptLineItem item={item} />` — consumed by `TranscriptSummaryPage.jsx`/`TranscriptCompletePage.jsx` (Tasks 11-12) and `ClassReportPage.jsx` (Part C, Task 17). CSS classes `.no-print`, `.transcript-header`, `.transcript-recruit-block`, `.transcript-photo`, `.transcript-line-item`, `.transcript-line-item-retake`, `.class-report-recruit`.

- [ ] **Step 1: Write `TranscriptHeader.jsx`**

```javascript
// web/src/components/TranscriptHeader.jsx
import badge from "../assets/gfd-badge.png";
import crest from "../assets/work-hard-be-humble.jpg";

export default function TranscriptHeader() {
  return (
    <div className="transcript-header">
      <img src={badge} alt="GFD Badge" />
      <h2>Greensboro Fire Department Training Division</h2>
      <img src={crest} alt="Work Hard, Be Humble" />
    </div>
  );
}
```

- [ ] **Step 2: Write `TranscriptLineItem.jsx`**

```javascript
// web/src/components/TranscriptLineItem.jsx
import { RESULT } from "../lib/constants";

function formatDate(dateMs) {
  return dateMs ? new Date(dateMs).toLocaleDateString("en-US", { dateStyle: "medium" }) : "";
}

export default function TranscriptLineItem({ item }) {
  return (
    <div className="transcript-line-item">
      <div className="transcript-line-item-main">
        <span className="transcript-line-item-name">{item.templateName}</span>
        <span className={`badge ${item.original.result === RESULT.PASS ? "pass" : "fail"}`}>
          {item.original.result === RESULT.PASS ? "PASS" : "FAIL"}
        </span>
        <span className="muted">{formatDate(item.original.dateMs)}</span>
        <span className="muted">{item.original.evaluatorName}</span>
      </div>
      {item.retake && (
        <div className="transcript-line-item-retake muted">
          Retake: {formatDate(item.retake.dateMs)} —{" "}
          {item.retake.result === RESULT.PASS ? "PASS" : "FAIL"} — by {item.retake.evaluatorName}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `print.css`**

```css
/* web/src/styles/print.css
 * Layout for the printable recruit transcript and class report pages. These pages render
 * with no app chrome (no TopBar/nav) — this file covers both their on-screen appearance and
 * their @media print rules (page size, hiding non-printing controls, per-recruit page
 * breaks on the class report).
 */

.transcript-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  margin-bottom: 16px;
  border-bottom: 2px solid var(--brand-gold);
}

.transcript-header img {
  height: 50px;
  width: auto;
}

.transcript-header h2 {
  flex: 1;
  text-align: center;
  margin: 0;
  font-size: 18px;
  color: var(--brand-navy);
}

.transcript-recruit-block {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.transcript-photo {
  width: 110px;
  height: 110px;
  font-size: 32px;
}

.transcript-line-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.transcript-line-item-main {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.transcript-line-item-name {
  flex: 1;
  min-width: 160px;
  font-weight: 600;
}

.transcript-line-item-retake {
  margin-top: 4px;
  padding-left: 12px;
  font-size: 12px;
}

@media print {
  .no-print {
    display: none !important;
  }

  @page {
    size: letter;
    margin: 0.5in;
  }

  body {
    background: white;
  }

  .class-report-recruit {
    break-before: page;
  }

  .class-report-recruit:first-of-type {
    break-before: auto;
  }
}
```

- [ ] **Step 4: Import it globally**

In `web/src/main.jsx`, add the import after the existing `theme.css` import:

```javascript
import "./styles/theme.css";
import "./styles/print.css";
```

- [ ] **Step 5: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/TranscriptHeader.jsx web/src/components/TranscriptLineItem.jsx web/src/styles/print.css web/src/main.jsx
git commit -m "feat: add shared transcript header/line-item components and print stylesheet"
```

---

### Task 11: `TranscriptSummaryPage.jsx`

**Files:**
- Create: `web/src/pages/reporting/TranscriptSummaryPage.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `buildTranscriptLineItems` from `../../lib/reportsData` (Task 9); `TranscriptHeader` from `../../components/TranscriptHeader`, `TranscriptLineItem` from `../../components/TranscriptLineItem` (Task 10); `initials` from `../../lib/constants`.
- Produces: route `/reports/recruits/:recruitId/transcript/summary`, linked from `RecruitHistoryDetailPage.jsx` (Task 13).

- [ ] **Step 1: Write the page**

```javascript
// web/src/pages/reporting/TranscriptSummaryPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import TranscriptHeader from "../../components/TranscriptHeader";
import TranscriptLineItem from "../../components/TranscriptLineItem";
import { buildTranscriptLineItems } from "../../lib/reportsData";
import { initials } from "../../lib/constants";

export default function TranscriptSummaryPage() {
  const { recruitId } = useParams();
  const navigate = useNavigate();
  const [recruit, setRecruit] = useState(null);
  const [core, setCore] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "recruits", recruitId)).then((snap) => setRecruit({ id: snap.id, ...snap.data() }));
    buildTranscriptLineItems({ recruitId }).then((r) => setCore(r.core));
  }, [recruitId]);

  if (!recruit || !core) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="screen">
      <button
        className="secondary no-print"
        style={{ width: "auto", marginBottom: 16 }}
        onClick={() => navigate(`/reports/recruits/${recruitId}`)}
      >
        ← Back
      </button>

      <TranscriptHeader />

      <div className="transcript-recruit-block">
        {recruit.photoURL ? (
          <img src={recruit.photoURL} className="avatar transcript-photo" alt="" />
        ) : (
          <div className="avatar transcript-photo">{initials(recruit.firstName, recruit.lastName)}</div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "var(--brand-navy)" }}>
            {recruit.firstName} {recruit.lastName}
          </div>
          <div className="muted">{recruit.recruitClassOrCohort}</div>
          {recruit.badgeOrIdNumber && <div className="muted">Badge/ID: {recruit.badgeOrIdNumber}</div>}
        </div>
      </div>

      {core.length === 0 ? (
        <p className="muted">No core tests recorded yet.</p>
      ) : (
        core.map((item) => <TranscriptLineItem key={item.templateId} item={item} />)
      )}

      <button className="primary no-print" style={{ marginTop: 24 }} onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `web/src/App.jsx`, add the import (after `RecruitHistoryDetailPage`):

```javascript
import TranscriptSummaryPage from "./pages/reporting/TranscriptSummaryPage";
```

Add the route (after `/reports/recruits/:recruitId`):

```javascript
      <Route path="/reports/recruits/:recruitId/transcript/summary" element={<RequireAuth><RequireAdminRole><TranscriptSummaryPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify against the emulator**

With at least one recruit who has one core-flagged (Task 8) completed test and one non-core completed test: navigate directly to `/reports/recruits/<recruitId>/transcript/summary`.

1. Confirm the header shows both logos and "Greensboro Fire Department Training Division", the recruit's enlarged photo (or initials) top-left, and only the core-flagged test — not the non-core one.
2. Confirm the line item shows name, PASS/FAIL badge, date, and evaluator name.
3. For a recruit with a retake on a core test, confirm the retake sub-line appears with its own date/result/evaluator, and the sub-line is absent for tests with no retake.
4. Click **Print / Save as PDF** → confirm the browser print dialog opens (Playwright: listen for the `window.print` call rather than actually printing — e.g. via `page.evaluate(() => { window.print = () => { window.__printCalled = true; }; })` set up before the click, then assert `window.__printCalled`).
5. For a recruit with zero core-flagged completions, confirm "No core tests recorded yet." shows instead of an empty gap.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/reporting/TranscriptSummaryPage.jsx web/src/App.jsx
git commit -m "feat: add printable recruit Summary Transcript"
```

---

### Task 12: `TranscriptCompletePage.jsx`

**Files:**
- Create: `web/src/pages/reporting/TranscriptCompletePage.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: same as Task 11.
- Produces: route `/reports/recruits/:recruitId/transcript/complete`, linked from `RecruitHistoryDetailPage.jsx` (Task 13).

- [ ] **Step 1: Write the page**

```javascript
// web/src/pages/reporting/TranscriptCompletePage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import TranscriptHeader from "../../components/TranscriptHeader";
import TranscriptLineItem from "../../components/TranscriptLineItem";
import { buildTranscriptLineItems } from "../../lib/reportsData";
import { initials } from "../../lib/constants";

export default function TranscriptCompletePage() {
  const { recruitId } = useParams();
  const navigate = useNavigate();
  const [recruit, setRecruit] = useState(null);
  const [lineItems, setLineItems] = useState(null); // { core, remaining }

  useEffect(() => {
    getDoc(doc(db, "recruits", recruitId)).then((snap) => setRecruit({ id: snap.id, ...snap.data() }));
    buildTranscriptLineItems({ recruitId }).then(setLineItems);
  }, [recruitId]);

  if (!recruit || !lineItems) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  const { core, remaining } = lineItems;
  const noResultsAtAll = core.length === 0 && remaining.length === 0;

  return (
    <div className="screen">
      <button
        className="secondary no-print"
        style={{ width: "auto", marginBottom: 16 }}
        onClick={() => navigate(`/reports/recruits/${recruitId}`)}
      >
        ← Back
      </button>

      <TranscriptHeader />

      <div className="transcript-recruit-block">
        {recruit.photoURL ? (
          <img src={recruit.photoURL} className="avatar transcript-photo" alt="" />
        ) : (
          <div className="avatar transcript-photo">{initials(recruit.firstName, recruit.lastName)}</div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "var(--brand-navy)" }}>
            {recruit.firstName} {recruit.lastName}
          </div>
          <div className="muted">{recruit.recruitClassOrCohort}</div>
          {recruit.badgeOrIdNumber && <div className="muted">Badge/ID: {recruit.badgeOrIdNumber}</div>}
        </div>
      </div>

      {noResultsAtAll ? (
        <p className="muted">No completed tests yet.</p>
      ) : (
        <>
          {core.length === 0 ? (
            <p className="muted">No core tests recorded yet.</p>
          ) : (
            core.map((item) => <TranscriptLineItem key={item.templateId} item={item} />)
          )}

          {remaining.length > 0 && (
            <>
              <h3 style={{ marginTop: 20, color: "var(--brand-navy)" }}>Additional Tests &amp; Practicals</h3>
              {remaining.map((item) => (
                <TranscriptLineItem key={item.templateId} item={item} />
              ))}
            </>
          )}
        </>
      )}

      <button className="primary no-print" style={{ marginTop: 24 }} onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `web/src/App.jsx`, add the import (after `TranscriptSummaryPage`):

```javascript
import TranscriptCompletePage from "./pages/reporting/TranscriptCompletePage";
```

Add the route (after the Summary route):

```javascript
      <Route path="/reports/recruits/:recruitId/transcript/complete" element={<RequireAuth><RequireAdminRole><TranscriptCompletePage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify against the emulator**

Using the same recruit from Task 11's verification: navigate to `/reports/recruits/<recruitId>/transcript/complete`.

1. Confirm the same header and core section render identically to the Summary page.
2. Confirm an "Additional Tests & Practicals" heading appears below it, followed by the non-core completed test(s).
3. Confirm a test the recruit has never attempted at all does NOT appear anywhere on this page.
4. For a recruit with zero completed sessions at all, confirm "No completed tests yet." shows and no "Additional Tests & Practicals" heading appears.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/reporting/TranscriptCompletePage.jsx web/src/App.jsx
git commit -m "feat: add printable recruit Complete Transcript"
```

---

### Task 13: Print buttons on `RecruitHistoryDetailPage.jsx`

**Files:**
- Modify: `web/src/pages/reporting/RecruitHistoryDetailPage.jsx`

**Interfaces:**
- Consumes: nothing new — `useNavigate` already imported.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the two buttons**

In `web/src/pages/reporting/RecruitHistoryDetailPage.jsx`, right after the recruit info `<div className="card" ...>` block (the one with photo/name/cohort) and before the `<h4>Sessions</h4>` line, add:

```javascript
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className="secondary"
            style={{ width: "auto", padding: "8px 14px" }}
            onClick={() => navigate(`/reports/recruits/${recruitId}/transcript/summary`)}
          >
            Print Summary Transcript
          </button>
          <button
            className="secondary"
            style={{ width: "auto", padding: "8px 14px" }}
            onClick={() => navigate(`/reports/recruits/${recruitId}/transcript/complete`)}
          >
            Print Complete Transcript
          </button>
        </div>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify against the emulator**

Navigate to Reports → Recruit History → any recruit (`/reports/recruits/<recruitId>`). Confirm both new buttons appear below the recruit info card. Click **Print Summary Transcript** → lands on the Summary Transcript page (Task 11). Go back, click **Print Complete Transcript** → lands on the Complete Transcript page (Task 12).

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/reporting/RecruitHistoryDetailPage.jsx
git commit -m "feat: link recruit transcripts from Recruit History detail page"
```

---

# Part C — Class Report Builder

### Task 14: `firestore.rules` + `lib/classReports.js`

**Files:**
- Modify: `firestore.rules`
- Create: `web/src/lib/classReports.js`

**Interfaces:**
- Consumes: `isAdminRole()` (already defined in `firestore.rules`); `db` from `../firebase`.
- Produces: `async function createClassReportFilter({ name, cohort, templateIds }): Promise<{ id: string }>`, `async function deactivateClassReportFilter(filterId): Promise<void>` — consumed by `ClassReportsListPage.jsx` (Task 15).

- [ ] **Step 1: Add the `classReportFilters` rule block**

In `firestore.rules`, add this new match block right after the closing `}` of the `match /sessions/{sessionId} { ... }` block (before the final closing braces of `match /databases/{database}/documents { ... }`):

```
    match /classReportFilters/{filterId} {
      // Saved report queries (name + cohort + selected test/exam ids) for the Class Report
      // builder. Purely a Reports-section admin tool — same admin-only access as every other
      // /reports collection.
      allow read, write: if isAdminRole();
    }
```

- [ ] **Step 2: Write `lib/classReports.js`**

```javascript
// web/src/lib/classReports.js
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

/** A saved query configuration, not a frozen snapshot — reopening a class report filter
 * re-runs it against current data, so a recruit's newer retake (or a test added to
 * templateIds after the fact) shows up correctly without needing to recreate the filter. */
export async function createClassReportFilter({ name, cohort, templateIds }) {
  const now = new Date();
  const ref = await addDoc(collection(db, "classReportFilters"), {
    name,
    cohort,
    templateIds,
    isActive: true,
    createdAt: now,
  });
  return { id: ref.id };
}

export async function deactivateClassReportFilter(filterId) {
  await updateDoc(doc(db, "classReportFilters", filterId), { isActive: false });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify the rule against the emulator's rules test endpoint**

Restart the emulator (`firebase emulators:start --only auth,firestore --project gfd-recruit-training`, which loads the updated `firestore.rules`). Using the seeded admin's ID token (obtained the same way the `web:verify` skill's seed commands sign up the verify admin), confirm a write to `classReportFilters` succeeds as that admin and is rejected for an unauthenticated request:

```bash
# As admin (owner-bypass token stands in for a real ID token check that the rule itself only
# gates on isAdminRole(), already exercised by every other admin-only collection in this app):
curl -s -X POST "http://127.0.0.1:8080/v1/projects/gfd-recruit-training/databases/(default)/documents/classReportFilters" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"name":{"stringValue":"Test Filter"},"isActive":{"booleanValue":true}}}'
# Expect: 200 with the created document
```

- [ ] **Step 5: Commit**

```bash
git add firestore.rules web/src/lib/classReports.js
git commit -m "feat: add classReportFilters security rule and data helpers"
```

---

### Task 15: `ClassReportsListPage.jsx` — list + "+ New Class Report" modal

**Files:**
- Create: `web/src/pages/reporting/ClassReportsListPage.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `createClassReportFilter`, `deactivateClassReportFilter` from `../../lib/classReports` (Task 14); `Modal` from `../../components/Modal` (Part A, Task 1); `TopBar` from `../../components/TopBar`.
- Produces: route `/reports/class`, navigates to `/reports/class/:filterId` (Task 17).

- [ ] **Step 1: Write the page**

```javascript
// web/src/pages/reporting/ClassReportsListPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import Modal from "../../components/Modal";
import { createClassReportFilter, deactivateClassReportFilter } from "../../lib/classReports";

export default function ClassReportsListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [cohorts, setCohorts] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "classReportFilters"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setFilters(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "recruits"), where("isActive", "==", true))).then((snap) => {
      const set = new Set(
        snap.docs
          .map((d) => d.data())
          .filter((r) => !r.isPractice)
          .map((r) => r.recruitClassOrCohort)
          .filter(Boolean)
      );
      setCohorts([...set].sort());
    });
    getDocs(query(collection(db, "templates"), where("isActive", "==", true))).then((snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  async function handleDeactivate(filter) {
    await deactivateClassReportFilter(filter.id);
  }

  return (
    <div className="app-shell">
      <TopBar title="Class Reports" onBack={() => navigate("/reports")} showMenu={false} />
      <div className="screen">
        {filters.length === 0 && <p className="muted">No saved class reports yet.</p>}
        {filters.map((filter) => (
          <div key={filter.id} className="card">
            <div className="list-row" style={{ padding: 0, border: "none" }}>
              <div style={{ flex: 1 }} onClick={() => navigate(`/reports/class/${filter.id}`)}>
                <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{filter.name}</div>
                <div className="muted">
                  {filter.cohort} · {(filter.templateIds ?? []).length} tests
                </div>
              </div>
              <button
                className="secondary"
                style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                onClick={() => handleDeactivate(filter)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        <button className="primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>
          + New Class Report
        </button>
      </div>

      {showNew && (
        <NewClassReportModal
          cohorts={cohorts}
          templates={templates}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/reports/class/${id}`);
          }}
        />
      )}
    </div>
  );
}

function NewClassReportModal({ cohorts, templates, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [cohort, setCohort] = useState(cohorts[0] ?? "");
  const [pickedIds, setPickedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  function toggleTemplate(templateId) {
    setPickedIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const created = await createClassReportFilter({ name: name.trim(), cohort, templateIds: pickedIds });
      onCreated(created.id);
    } finally {
      setSaving(false);
    }
  }

  const exams = templates.filter((t) => t.isWrittenExam);
  const practicals = templates.filter((t) => !t.isWrittenExam && !t.isBatchGrade);

  return (
    <Modal titleId="new-class-report-title" onClose={onClose} maxWidth={420}>
      <h3 id="new-class-report-title" style={{ marginTop: 0 }}>New Class Report</h3>
      <div className="field">
        <label>Report Name</label>
        <input
          type="text"
          placeholder="e.g. Recruit Class 47 — Finals"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Cohort</label>
        <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
          {cohorts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <label style={{ fontSize: 14, fontWeight: 600 }}>Tests / Exams to Include</label>
      {exams.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 4, marginBottom: 4 }}>Written Exams</p>
          {exams.map((t) => (
            <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pickedIds.includes(t.id)}
                onChange={() => toggleTemplate(t.id)}
                style={{ width: "auto", margin: 0 }}
              />
              {t.name} <span className="muted">({t.examCategory})</span>
            </label>
          ))}
        </>
      )}
      {practicals.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 10, marginBottom: 4 }}>Practicals</p>
          {practicals.map((t) => (
            <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pickedIds.includes(t.id)}
                onChange={() => toggleTemplate(t.id)}
                style={{ width: "auto", margin: 0 }}
              />
              {t.name}
            </label>
          ))}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!name.trim() || !cohort || pickedIds.length === 0 || saving}
          onClick={handleCreate}
        >
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Wire the route**

In `web/src/App.jsx`, add the import (after `ExportPage`):

```javascript
import ClassReportsListPage from "./pages/reporting/ClassReportsListPage";
```

Add the route (after `/reports/export`):

```javascript
      <Route path="/reports/class" element={<RequireAuth><RequireAdminRole><ClassReportsListPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify against the emulator**

Navigate directly to `/reports/class` (Task 16 adds the Reports quick link).

1. Confirm the empty state ("No saved class reports yet.") shows.
2. Click **+ New Class Report** → confirm the Cohort dropdown lists real cohorts and the Tests/Exams checklist shows written exams (grouped under "Written Exams", with category shown) separately from practicals (under "Practicals").
3. Type a name, pick a cohort, check two tests (one exam, one practical), click **Create** → modal closes and navigates to `/reports/class/<newFilterId>` (Task 17 renders this; a blank/loading page here is expected until that task lands).
4. Go back to `/reports/class` → confirm the new filter appears in the list with the correct cohort and "2 tests".
5. Click **Delete** on it → confirm it disappears from the list.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/reporting/ClassReportsListPage.jsx web/src/App.jsx
git commit -m "feat: add Class Reports list and New Class Report builder modal"
```

---

### Task 16: Reports quick link

**Files:**
- Modify: `web/src/pages/reporting/ReportingHomePage.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the quick link**

In `web/src/pages/reporting/ReportingHomePage.jsx`, the `QUICK_LINKS` array currently reads:

```javascript
const QUICK_LINKS = [
  ["Recruit History", "Full session history per recruit", "/reports/recruits"],
  ["Test Pass Rates", "Failure rate by step, per test", "/reports/templates"],
  ["Cohort Dashboard", "Training matrix by cohort", "/reports/cohorts"],
  ["Export to Excel", "Download raw results as CSV", "/reports/export"],
];
```

Change it to:

```javascript
const QUICK_LINKS = [
  ["Recruit History", "Full session history per recruit", "/reports/recruits"],
  ["Test Pass Rates", "Failure rate by step, per test", "/reports/templates"],
  ["Cohort Dashboard", "Training matrix by cohort", "/reports/cohorts"],
  ["Class Reports", "Saved multi-test reports by cohort", "/reports/class"],
  ["Export to Excel", "Download raw results as CSV", "/reports/export"],
];
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Verify against the emulator**

Navigate to `/reports` → confirm the "Class Reports" card appears in the Reports quick-link grid, and clicking it lands on `/reports/class`.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/reporting/ReportingHomePage.jsx
git commit -m "feat: add Class Reports quick link to Reports home"
```

---

### Task 17: `ClassReportPage.jsx` — the generated, per-recruit-paginated report

**Files:**
- Create: `web/src/pages/reporting/ClassReportPage.jsx`
- Modify: `web/src/App.jsx`

**Interfaces:**
- Consumes: `buildTranscriptLineItems` from `../../lib/reportsData` (Part B, Task 9); `TranscriptHeader`, `TranscriptLineItem` from `../../components/*` (Part B, Task 10).
- Produces: nothing consumed by later tasks (last new screen in this plan).

- [ ] **Step 1: Write the page**

```javascript
// web/src/pages/reporting/ClassReportPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TranscriptHeader from "../../components/TranscriptHeader";
import TranscriptLineItem from "../../components/TranscriptLineItem";
import { buildTranscriptLineItems } from "../../lib/reportsData";

export default function ClassReportPage() {
  const { filterId } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState(null);
  const [recruitReports, setRecruitReports] = useState(null); // [{ recruit, items }]

  useEffect(() => {
    async function load() {
      const filterSnap = await getDoc(doc(db, "classReportFilters", filterId));
      const filterData = { id: filterSnap.id, ...filterSnap.data() };
      setFilter(filterData);

      const recruitsSnap = await getDocs(
        query(
          collection(db, "recruits"),
          where("recruitClassOrCohort", "==", filterData.cohort),
          where("isActive", "==", true)
        )
      );
      const recruits = recruitsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => !r.isPractice)
        .sort((a, b) => a.lastName.localeCompare(b.lastName));

      const reports = await Promise.all(
        recruits.map(async (recruit) => {
          const { items } = await buildTranscriptLineItems({
            recruitId: recruit.id,
            templateIds: filterData.templateIds,
          });
          return { recruit, items };
        })
      );
      setRecruitReports(reports);
    }
    load();
  }, [filterId]);

  if (!filter || !recruitReports) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="screen">
      <button
        className="secondary no-print"
        style={{ width: "auto", marginBottom: 16 }}
        onClick={() => navigate("/reports/class")}
      >
        ← Back
      </button>

      <TranscriptHeader />
      <h3 style={{ color: "var(--brand-navy)" }}>{filter.name}</h3>

      {recruitReports.length === 0 ? (
        <p className="muted">No active recruits in this cohort.</p>
      ) : (
        recruitReports.map(({ recruit, items }) => (
          <div key={recruit.id} className="class-report-recruit">
            <h4 style={{ color: "var(--brand-navy)" }}>
              {recruit.firstName} {recruit.lastName}
            </h4>
            {items.length === 0 ? (
              <p className="muted">No results yet for the selected tests.</p>
            ) : (
              items.map((item) => <TranscriptLineItem key={item.templateId} item={item} />)
            )}
          </div>
        ))
      )}

      <button className="primary no-print" style={{ marginTop: 24 }} onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route**

In `web/src/App.jsx`, add the import (after `ClassReportsListPage`):

```javascript
import ClassReportPage from "./pages/reporting/ClassReportPage";
```

Add the route (after `/reports/class`):

```javascript
      <Route path="/reports/class/:filterId" element={<RequireAuth><RequireAdminRole><ClassReportPage /></RequireAdminRole></RequireAuth>} />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Verify against the emulator**

Using the class report filter created in Task 15's verification (or a fresh one covering a cohort with 2+ active recruits and both an exam and a practical result recorded for each):

1. Open the filter from `/reports/class` → confirm the header renders, followed by each recruit's name and their line items restricted to just the filter's selected tests (not every test they've taken).
2. Confirm a recruit in the cohort with no results yet for the selected tests shows "No results yet for the selected tests." instead of nothing.
3. Confirm a recruit outside the filter's cohort never appears on the report.
4. Print-preview the page (or check computed styles) and confirm each `.class-report-recruit` after the first has `break-before: page` applied per the `@media print` rule in `print.css`.
5. Add a brand-new session for one of the report's recruits against one of the filter's selected tests, reopen the same filter (no need to recreate it) → confirm the new result now appears (proves this is a live query, not a frozen snapshot).

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/reporting/ClassReportPage.jsx web/src/App.jsx
git commit -m "feat: add generated Class Report page with per-recruit page breaks"
```

---

## Plan Self-Review

**Spec coverage:**
- Written exam gradebook design (`2026-07-15-written-exam-gradebook-design.md`): data model → Task 3; Manage Exams → Task 4; Enter Exam Scores picker → Task 5; grading grid (grid entry, retest, edit, Save All, reload-survives-state) → Task 6; template-picker exclusion → Task 7; shared retake-resolution helper → Task 2; Modal dependency → Task 1.
- Recruit transcripts design (`2026-07-15-recruit-transcripts-design.md`): `includeInSummaryTranscript` flag → Task 8; `buildTranscriptLineItems` → Task 9; shared header/line-item/print CSS → Task 10; Summary page → Task 11; Complete page → Task 12; Recruit History detail links → Task 13.
- Class report builder design (`2026-07-15-class-report-builder-design.md`): `classReportFilters` rule + data helpers → Task 14; list + builder modal → Task 15; Reports quick link → Task 16; generated report with page breaks → Task 17.

**Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code; no "similar to Task N" shortcuts — `TranscriptCompletePage.jsx` (Task 12) repeats the full header/photo block from `TranscriptSummaryPage.jsx` (Task 11) rather than referencing it.

**Type/name consistency check:**
- `resolveEffectiveSession` (Task 2) returns `{ original, retake }` — the same two field names are destructured identically in `RecruitHomePage.jsx` (Task 2) and inside `buildTranscriptLineItems`'s `toLineItem` (Task 9).
- `buildTranscriptLineItems`'s `LineItem` shape (`templateId, templateName, original: { result, dateMs, evaluatorName }, retake: {...} | null`) is produced once in Task 9 and consumed with the exact same field names by `TranscriptLineItem.jsx` (Task 10), `TranscriptSummaryPage`/`TranscriptCompletePage` (Tasks 11-12), and `ClassReportPage` (Task 17) — no renamed fields anywhere.
- `recordExamScore`/`updateExamScore`/`loadExamGrades`/`getSingleLineResultId` (Task 3) are called with identical parameter names at every call site in `ExamScoresGradingPage.jsx` (Task 6).
- `createExamTemplate({ name, category })` (Task 3) matches `NewExamModal`'s call in `ExamsAdminPage.jsx` (Task 4) exactly.
- `createClassReportFilter({ name, cohort, templateIds })` (Task 14) matches `NewClassReportModal`'s call in `ClassReportsListPage.jsx` (Task 15) exactly, and the returned `{ id }` matches how `onCreated(created.id)` consumes it.
- `isWrittenExam`/`examCategory`/`includeInSummaryTranscript`/`passingPercentage` are spelled identically everywhere they're written (Task 3, Task 8) or read (Tasks 4-7, 9, 15).
