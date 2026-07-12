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
