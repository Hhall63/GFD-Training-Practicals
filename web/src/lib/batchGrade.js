import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
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

async function createBatchGradeTemplateDoc(name, description) {
  const now = new Date();
  const templateRef = await addDoc(collection(db, "templates"), {
    name,
    ...(description ? { description } : {}),
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
  return { id: templateRef.id, name, ...(description ? { description } : {}) };
}

/** Public "Add New" entry point — one template, called from BatchGradePage. */
export async function createBatchGradeTemplate(name, description) {
  return createBatchGradeTemplateDoc(name, description);
}

/**
 * Seeds one Batch Grade template at a fixed, deterministic doc ID derived from its index in
 * BATCH_GRADE_SEED_NAMES (not a slugified name — simpler, no collision edge cases). Uses
 * setDoc (last-write-wins overwrite) instead of addDoc so that even if two concurrent callers
 * both pass the existence check below, they write identical content to the same doc ID —
 * the race becomes a harmless redundant write instead of a duplicate document. This is what
 * makes ensureBatchGradeSeedTemplates safe under React StrictMode's double-invoke.
 *
 * The template doc and its one line doc are written in a single batch, not as two separate
 * setDoc calls — otherwise a crash/network drop between them could strand a template with no
 * line, and since only the template doc's existence is checked, no future call would ever
 * retry the missing line.
 */
async function seedOneBatchGradeTemplate(name, index) {
  const templateId = `batch-seed-${index}`;
  const templateRef = doc(db, "templates", templateId);
  const existing = await getDoc(templateRef);
  if (existing.exists()) return; // already seeded, by this call or a concurrent one
  const now = new Date();
  const batch = writeBatch(db);
  batch.set(templateRef, {
    name,
    isActive: true,
    isBatchGrade: true,
    passingPercentage: 100,
    createdAt: now,
  });
  batch.set(doc(db, "templates", templateId, "lines", "line0"), {
    lineType: LINE_TYPES.GRADED,
    lineText: name,
    points: 1,
    isCritical: false,
    sortOrder: 0,
  });
  await batch.commit();
}

/**
 * Seeds the 18 default Batch Grade templates the first time anyone opens BatchGradePage.
 * Keeps the cheap existence-check fast path (skips the whole operation on every normal page
 * load after the first successful seed), but each individual seed write is now idempotent by
 * fixed doc ID (see seedOneBatchGradeTemplate), so even if two calls both get past this check
 * concurrently, the result is still exactly one doc per seed name.
 */
export async function ensureBatchGradeSeedTemplates() {
  const existing = await getDocs(
    query(collection(db, "templates"), where("isBatchGrade", "==", true))
  );
  if (!existing.empty) return;

  await Promise.all(
    BATCH_GRADE_SEED_NAMES.map((name, index) => seedOneBatchGradeTemplate(name, index))
  );
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
    ...(template.description ? { templateDescription: template.description } : {}),
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

/**
 * Reverses a batch-grade result recorded by recordBatchGradeResult: batches the session's
 * lineResults doc delete(s) with the session doc's own delete so the whole set commits
 * atomically — no ordering dependency, just no partial deletion if it fails. Does not
 * attempt to recall a failure-notification email that may have already been sent — see
 * docs/superpowers/plans/2026-07-18-batch-grade-undo-plan.md.
 */
export async function deleteBatchGradeResult(sessionId) {
  const lineResultsSnap = await getDocs(collection(db, "sessions", sessionId, "lineResults"));
  const batch = writeBatch(db);
  lineResultsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "sessions", sessionId));
  await batch.commit();
}
