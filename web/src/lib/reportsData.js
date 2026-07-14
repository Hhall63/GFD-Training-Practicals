import { collection, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { RESULT, SESSION_STATUS } from "./constants";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toMillis(ts) {
  return ts?.toMillis?.() ?? 0;
}

/**
 * Loads the raw data the Command Board (Reports home) is built from: active recruits,
 * active templates (readiness-matrix columns), and every completed session — then strips
 * out anything tied to the built-in practice recruit (Task 6) so practice activity never
 * leaks into an analytic.
 *
 * Firestore's `where in` caps at 30 items, so rather than chunking recruit ids to fetch
 * their sessions (as CohortDashboardPage does for a single cohort), this loads ALL
 * completed sessions in one query and joins/filters client-side. That's the simplest robust
 * approach at this app's scale — if session volume grows large enough for a single
 * `sessions` read to become expensive, this is the place to add pagination or a
 * date-bounded query.
 *
 * Practice filtering is client-side (`!doc.isPractice`) rather than a query filter because
 * normal recruits/sessions simply omit the field — Firestore has no `!=` that reliably
 * matches "field is false or absent" without a composite index/backfill.
 *
 * Accepts an optional Firestore instance so callers signed into a different Firebase Auth session (e.g. the anonymous Live Dashboard) can load through their own credential — defaults to this app's primary db.
 */
export async function loadCommandBoardData(firestoreDb = db) {
  const [recruitsSnap, templatesSnap, sessionsSnap] = await Promise.all([
    getDocs(query(collection(firestoreDb, "recruits"), where("isActive", "==", true))),
    getDocs(query(collection(firestoreDb, "templates"), where("isActive", "==", true))),
    getDocs(query(collection(firestoreDb, "sessions"), where("status", "==", SESSION_STATUS.COMPLETED))),
  ]);

  const recruits = recruitsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => !r.isPractice)
    .sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? ""));

  const templates = templatesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.isPractice);

  return { recruits, templates, sessions };
}

/**
 * Flagged list: one row per recruit with at least one failed completed session, carrying
 * their single most significant failure — a critical failure outranks a non-critical one,
 * and ties break to whichever session started most recently. Only recruits present in
 * `recruits` (active, non-practice) are surfaced, so a deactivated recruit's old failure
 * doesn't linger on the board.
 */
export function computeFlagged({ recruits, sessions }) {
  const recruitsById = new Map(recruits.map((r) => [r.id, r]));
  const worstByRecruit = new Map(); // recruitId -> session

  for (const s of sessions) {
    if (s.overallResult !== RESULT.FAIL) continue;
    if (!recruitsById.has(s.recruitId)) continue;
    const existing = worstByRecruit.get(s.recruitId);
    if (!existing) {
      worstByRecruit.set(s.recruitId, s);
      continue;
    }
    const existingCritical = !!existing.criticalFailure;
    const candidateCritical = !!s.criticalFailure;
    if (candidateCritical && !existingCritical) {
      worstByRecruit.set(s.recruitId, s);
    } else if (candidateCritical === existingCritical && toMillis(s.startedAt) > toMillis(existing.startedAt)) {
      worstByRecruit.set(s.recruitId, s);
    }
  }

  return [...worstByRecruit.entries()]
    .map(([recruitId, session]) => {
      const recruit = recruitsById.get(recruitId);
      return {
        recruitId,
        recruitName: recruit ? `${recruit.firstName} ${recruit.lastName}` : session.recruitName,
        templateName: session.templateName,
        criticalFailure: !!session.criticalFailure,
        startedAtMs: toMillis(session.startedAt),
      };
    })
    .sort((a, b) => b.startedAtMs - a.startedAtMs);
}

/**
 * KPI stat-row values. `atRiskCount` is passed in rather than recomputed so it always
 * matches the flagged list exactly (one row per at-risk recruit) instead of drifting from
 * a second, slightly different definition of "at risk".
 */
export function computeKpis({ recruits, sessions, atRiskCount }) {
  const activeRecruitCount = recruits.length;

  const passCount = sessions.filter((s) => s.overallResult === RESULT.PASS).length;
  const overallPassRate = sessions.length ? passCount / sessions.length : null;

  const weekAgoMs = Date.now() - 7 * MS_PER_DAY;
  const testsThisWeek = sessions.filter((s) => {
    const ms = toMillis(s.completedAt) || toMillis(s.startedAt);
    return ms >= weekAgoMs;
  }).length;

  return { activeRecruitCount, overallPassRate, testsThisWeek, atRiskCount };
}

/**
 * Cohort readiness matrix: recruit rows x attempted-template columns, each cell the result
 * of the latest completed session for that recruit/template pair (or absent = not tested).
 * Mirrors CohortDashboardPage's "keep only the most recently started session per pair"
 * merge, just across every active recruit instead of one cohort at a time.
 *
 * Columns are restricted to templates with at least one completed session anywhere in
 * `sessions` — an active-but-never-run template doesn't get a column. This keeps the matrix
 * growing with real testing activity instead of front-loading every configured template
 * (including ones nobody's attempted yet) as a wall of "not tested" cells from day one.
 */
export function computeReadinessMatrix({ recruits, templates, sessions }) {
  const latest = new Map(); // `${recruitId}_${templateId}` -> { result, startedAtMs }
  const attemptedTemplateIds = new Set();
  for (const s of sessions) {
    const key = `${s.recruitId}_${s.templateId}`;
    const startedAtMs = toMillis(s.startedAt);
    const existing = latest.get(key);
    if (!existing || startedAtMs > existing.startedAtMs) {
      latest.set(key, { result: s.overallResult, startedAtMs });
    }
    attemptedTemplateIds.add(s.templateId);
  }
  const attemptedTemplates = templates.filter((t) => attemptedTemplateIds.has(t.id));
  return { recruits, templates: attemptedTemplates, latest };
}

/** Composes the three derived views the Command Board renders from one shared data load. */
export function buildCommandBoard({ recruits, templates, sessions }) {
  const flagged = computeFlagged({ recruits, sessions });
  const kpis = computeKpis({ recruits, sessions, atRiskCount: flagged.length });
  const matrix = computeReadinessMatrix({ recruits, templates, sessions });
  return { kpis, flagged, matrix };
}

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
