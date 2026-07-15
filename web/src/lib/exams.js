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
