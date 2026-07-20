import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
import { db } from "../firebase";
import { compressImageToDataUrl } from "../lib/image";
import { sendFailureEmail } from "../lib/notify";
import { computeTimerResult, formatSeconds, LINE_TYPES, RESULT, SESSION_STATUS } from "../lib/constants";
import { defaultObstacleCourseConfig, missingRequiredDistances, seedObstacleTallies } from "../lib/obstacleCourse";
import { sanitizeHtml } from "../lib/richText";
import ObstacleCourseRunner from "../components/ObstacleCourseRunner";
import ChecklistView from "../components/ChecklistView";
import TileView from "../components/TileView";

export default function LiveTestRunnerPage() {
  const { sessionId } = useParams();
  return <LiveTestRunnerRun key={sessionId} sessionId={sessionId} />;
}

function LiveTestRunnerRun({ sessionId }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sessionData, setSessionData] = useState(null);
  const [lineResults, setLineResults] = useState(null);
  // Only populated when this session is part of a Test Group (sessionData.groupId is set) —
  // the group's ordered templateIds, read once on mount alongside the session/lineResults
  // fetch, so we know whether this is the last test in the group and what template to seed
  // next for "Go to Next Test".
  const [groupTemplateIds, setGroupTemplateIds] = useState(null);
  const [showGroupContinue, setShowGroupContinue] = useState(false);
  const [creatingNextTest, setCreatingNextTest] = useState(false);
  // Purely presentational — which display view is showing. Never read by the timer effect,
  // patchCurrent/gradeLine, or finishSession, so switching views mid-test can't disturb
  // progress, grading, or a running timer.
  const [viewMode, setViewMode] = useState(location.state?.initialViewMode ?? "standard");
  // finishSession() needs the just-patched note/result even when it runs inside the same
  // handler that patched it (e.g. the Note Required modal's "Save & Continue"), where a
  // re-render hasn't happened yet and the handler's own closure over `lineResults` is still
  // the pre-patch value. patchCurrent keeps this ref in sync synchronously so reads are
  // never stale regardless of render timing.
  const lineResultsRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [showDistanceRequired, setShowDistanceRequired] = useState(false);
  const [missingDistanceObstacles, setMissingDistanceObstacles] = useState([]);
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
  const timerStartRef = useRef(null);
  const intervalRef = useRef(null);
  // Records which line's timer is actually running, independent of currentIndex. Stop must
  // finalize this line, not `current` — currentIndex can move off the running timer's line
  // while it's running (e.g. tapping "View" on another line from Checklist/Tile), and without
  // this ref stopTimer() would silently patch whatever line happens to be current instead.
  const runningTimerLineIdRef = useRef(null);
  // Whole-test stopwatch (Task 10). Independent of currentIndex/viewMode by design — it
  // starts the instant the template's Overall Timer line loads and keeps running across
  // every view until Stop Test is pressed, unlike the per-step timer above.
  const [overallElapsed, setOverallElapsed] = useState(0);
  const [isOverallRunning, setIsOverallRunning] = useState(false);
  const [overallPauseEvents, setOverallPauseEvents] = useState([]);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const overallStartRef = useRef(null);
  const overallIntervalRef = useRef(null);
  // 3-2-1 countdown shown before a template's Overall Timer starts. countdownArmedRef is a
  // one-time latch (a ref, not state) so the countdown is offered exactly once per session.
  // overallTimerLine's object identity changes again later in the test (every patchLine()
  // write touches it, e.g. Stop Test finalizing it) — without this latch, the arm-effect
  // below would fire again on that later change and reopen the countdown mid-test.
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const countdownArmedRef = useRef(false);
  // Mirrors showCountdown but updates synchronously (refs have no commit-boundary delay,
  // unlike setState). The auto-start effect below reads this instead of the showCountdown
  // state so it sees the arm-effect's write within the SAME commit, not one render later.
  const showCountdownRef = useRef(false);

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

  useEffect(() => () => clearInterval(intervalRef.current), []);

  // The whole-test line, if this template has one — found fresh on every render so it picks
  // up the result/pauseEvents patchLine() writes once Stop Test finalizes it.
  const overallTimerLine = lineResults?.find((l) => l.lineTypeSnapshot === LINE_TYPES.OVERALL_TIMER);

  // Arms the countdown exactly once per session, the first time this session's Overall
  // Timer line is seen unfinished. Templates without an Overall Timer line never set this —
  // overallTimerLine stays undefined, so the countdown never shows, same as today.
  useEffect(() => {
    if (overallTimerLine && overallTimerLine.result == null && !countdownArmedRef.current) {
      countdownArmedRef.current = true;
      showCountdownRef.current = true;
      setShowCountdown(true);
    }
  }, [overallTimerLine]);

  // Ticks the countdown down from 3 to 0, one second at a time, then closes the overlay.
  useEffect(() => {
    if (!showCountdown) return;
    if (countdownValue === 0) {
      showCountdownRef.current = false;
      setShowCountdown(false);
      return;
    }
    const timeout = setTimeout(() => setCountdownValue((v) => v - 1), 1000);
    return () => clearTimeout(timeout);
  }, [showCountdown, countdownValue]);

  // Auto-starts the instant the Overall Timer line is available and hasn't already been
  // finalized (result == null) — independent of currentIndex/viewMode, so switching steps or
  // views never restarts or interrupts it. Re-runs when overallTimerLine's own object identity
  // changes (i.e. when patchLine touches it) or when the countdown finishes (showCountdown
  // flips false) — the actual start/stop decision gates on showCountdownRef (a ref, not this
  // state) so a sibling effect's setShowCountdown() in the same commit can't race this one.
  useEffect(() => {
    if (overallTimerLine && overallTimerLine.result == null && !isOverallRunning && !showCountdownRef.current) {
      overallStartRef.current = Date.now();
      setIsOverallRunning(true);
      overallIntervalRef.current = setInterval(() => {
        setOverallElapsed((Date.now() - overallStartRef.current) / 1000);
      }, 100);
    }
    return () => clearInterval(overallIntervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overallTimerLine, showCountdown]);

  const current = lineResults?.[currentIndex];
  const isLastLine = lineResults && currentIndex === lineResults.length - 1;
  // Whether there's another test queued up after this one in the group. If the group's
  // templateIds haven't loaded yet (shouldn't normally happen — it's fetched on mount
  // alongside the session), this safely defaults to "last test" rather than blocking.
  const isMidGroup =
    !!sessionData?.groupId &&
    !!groupTemplateIds &&
    sessionData.groupSequenceIndex + 1 < groupTemplateIds.length;
  // The obstacle course is a full-screen dashboard with its own controls, so the test
  // chrome (progress bar, "Line X of Y", and the step's own title) just gets in the way.
  const isObstacleCourse = current?.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE;
  // Template-level (not "current line") check: does ANY line in this session's template
  // use the obstacle-course dashboard. Checklist/Tile show every line at once, which can't
  // represent the obstacle course's full-screen dashboard, so any template containing one is
  // pinned to Standard for its entire run, not just while the obstacle-course line is current.
  const hasObstacleCourse = !!lineResults?.some((l) => l.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE);
  // The view actually rendered. Derived (not synced via an effect) so it can never be stale
  // or bypassed: even if `viewMode` state holds "checklist"/"tile" (e.g. carried in via
  // router state from RecruitConfirmPage, or via goToNextTest's `state: { initialViewMode }`
  // when hopping into the next test of a Test Group), this always collapses to "standard"
  // for an obstacle-course template — there's no code path that reads raw `viewMode` for
  // rendering, only this.
  const effectiveViewMode = hasObstacleCourse ? "standard" : viewMode;

  // Name-addressed write, shared by patchCurrent (index-addressed, used by the Standard
  // single-step card) and gradeLine (used by the Checklist/Tile views, which grade lines
  // out of order and so can't rely on currentIndex). Keeping one write path means both ever
  // touch the same Firestore update shape and the same lineResultsRef sync.
  function patchLine(lineId, fields) {
    setLineResults((prev) => {
      const copy = prev.map((l) => (l.id === lineId ? { ...l, ...fields } : l));
      lineResultsRef.current = copy;
      return copy;
    });
    return updateDoc(doc(db, "sessions", sessionId, "lineResults", lineId), fields);
  }

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

  // Name-addressed grading for the Checklist/Tile views, which show every line at once and
  // let the evaluator grade any of them without making it "current" first. Generalizes
  // setGradedResult (below), which only ever grades `current`.
  async function gradeLine(lineId, result) {
    const line = lineResultsRef.current?.find((l) => l.id === lineId);
    if (!line) return;
    const pointsEarned = result === RESULT.PASS ? (line.pointsSnapshot ?? 0) : 0;
    await patchLine(lineId, { result, pointsEarned });
  }

  // Used by the Checklist/Tile views to open a line (obstacle-course/instruction) that
  // can't be graded with a single tap in the Standard single-step card instead.
  function jumpToStandard(lineId) {
    const index = lineResults.findIndex((l) => l.id === lineId);
    if (index === -1) return;
    setCurrentIndex(index);
    setViewMode("standard");
  }

  // Lets the Checklist/Tile views run a Timer line's Start/Stop inline without leaving the
  // view (Task 4), by reusing the exact same single-timer path the Standard card uses:
  // make that line "current" first, then call the existing startTimer(). stopTimer() always
  // finalizes runningTimerLineIdRef (set explicitly by startTimer), not `current` — currentIndex
  // can move off the running line (e.g. tapping "View" on another line) while the timer keeps
  // running, so Stop must not depend on whatever happens to be current at that moment.
  function onStartTimer(lineId) {
    const index = lineResults.findIndex((l) => l.id === lineId);
    if (index === -1) return;
    setCurrentIndex(index);
    startTimer(lineId);
  }

  function startTimer(lineId) {
    runningTimerLineIdRef.current = lineId;
    timerStartRef.current = Date.now();
    setElapsed(0);
    setIsTimerRunning(true);
    intervalRef.current = setInterval(() => {
      setElapsed((Date.now() - timerStartRef.current) / 1000);
    }, 100);
  }

  async function stopTimer() {
    clearInterval(intervalRef.current);
    setIsTimerRunning(false);
    const lineId = runningTimerLineIdRef.current;
    const line = lineResultsRef.current?.find((l) => l.id === lineId);
    runningTimerLineIdRef.current = null;
    if (!line) return; // defensive — shouldn't happen while a timer is running
    const finalElapsed = (Date.now() - timerStartRef.current) / 1000;
    const result = computeTimerResult(finalElapsed, line.passThresholdSecondsSnapshot);
    // All-or-nothing: full points for finishing within the time limit, zero otherwise.
    const pointsEarned = result === RESULT.PASS ? (line.pointsSnapshot ?? 0) : 0;
    await patchLine(lineId, { timerElapsedSeconds: finalElapsed, result, pointsEarned });
  }

  function setGradedResult(result) {
    const pointsEarned = result === RESULT.PASS ? (current.pointsSnapshot ?? 0) : 0;
    return patchCurrent({ result, pointsEarned });
  }

  function canAdvance() {
    if (!current) return false;
    // The Overall Timer line is only ever scored by Stop Test (see its dedicated read-only
    // LineCard branch), never by completing whichever line happens to be last. Without this
    // check, a template shaped like [Overall Timer, ...graded steps..., closing Instruction]
    // could be finished via Submit on that closing line while the Overall Timer line itself
    // sits ungraded — silently dropping its result/elapsed time/pause history from the report.
    if (isLastLine && overallTimerLine && overallTimerLine.result == null) return false;
    // Instruction and Overall Timer cards both have nothing to grade inline (Overall Timer is
    // only ever graded by the sticky Stop Test banner, which works independently of
    // currentIndex in every view) — so neither should block moving to the next line. The
    // guard immediately above already blocks finishing the test while the Overall Timer is
    // ungraded; it's scoped to isLastLine, so it doesn't interfere here — this branch only
    // unblocks stepping past the timer mid-template, never finishing while it's ungraded.
    if (current.lineTypeSnapshot === LINE_TYPES.INSTRUCTION || current.lineTypeSnapshot === LINE_TYPES.OVERALL_TIMER) {
      return true;
    }
    // A result must be recorded first. The note-required-on-failure rule is enforced with a
    // blocking pop-up in advance() (like the distance gate), rather than by silently
    // disabling this button — so the evaluator gets a clear prompt instead of a dead button.
    return !!current.result;
  }

  // Shared by finishSession (to actually record the outcome) and advance (to preview it
  // before the last line submits) — one place computes pass/fail so the two can never
  // disagree about whether the test is about to fail.
  function computeSessionOutcome(results) {
    const graded = results.filter((l) => l.lineTypeSnapshot !== LINE_TYPES.INSTRUCTION);
    const totalPointsEarned = graded.reduce((sum, l) => sum + (l.pointsEarned ?? 0), 0);
    const totalPointsPossible = graded.reduce((sum, l) => sum + (l.pointsSnapshot ?? 0), 0);
    // No points defined on this test at all (e.g. an all-instruction template) — treat as
    // an automatic pass rather than dividing by zero.
    const percentageEarned = totalPointsPossible > 0 ? (totalPointsEarned / totalPointsPossible) * 100 : 100;
    // A failed critical step fails the whole test outright, no matter the point total.
    const criticalFailure = graded.some((l) => l.isCriticalSnapshot && l.result === RESULT.FAIL);
    const overallResult =
      !criticalFailure && percentageEarned >= sessionData.passingPercentageSnapshot
        ? RESULT.PASS
        : RESULT.FAIL;
    return { overallResult, criticalFailure, totalPointsEarned, totalPointsPossible };
  }

  async function finishSession() {
    // Read from the ref, not the `lineResults` state closure: a note just patched by the
    // Note Required modal's "Save & Continue" (in this same handler, before any re-render)
    // would otherwise be missed. See the lineResultsRef comment above.
    const results = lineResultsRef.current ?? lineResults;
    const { overallResult, criticalFailure, totalPointsEarned, totalPointsPossible } =
      computeSessionOutcome(results);

    const finishedSession = {
      ...sessionData,
      id: sessionId, // buildFailureBody links to /reports/sessions/:id (the graded course, view-only, free — EmailJS attachments need a paid plan)
      overallResult,
      criticalFailure,
      totalPointsEarned,
      totalPointsPossible,
    };

    // On a failure, email the admins who opted into failure notifications. Best-effort:
    // a failed/unconfigured send never blocks the evaluator — the Results screen shows
    // the outcome and offers a manual compose button as backup. Recipients are resolved
    // once here and stored, so the Results screen never re-queries them (a second query
    // could come back empty and wrongly claim no one is subscribed).
    //
    // Intentionally NOT gated on sessionData.isPractice: a failed practice-recruit run is
    // exactly when an evaluator is most likely to be testing this notification pipeline
    // itself, so it must behave identically to a real recruit's failure. Do not add an
    // isPractice skip here — practice-recruit sessions are already excluded from every
    // reporting/history view (CohortDashboardPage, RecruitHistoryListPage, ExportPage,
    // reportsData.js), which is the correct place for that exclusion, not this send.
    let failureEmail = { status: null, recipients: [], error: null };
    if (overallResult === RESULT.FAIL) {
      failureEmail = await sendFailureEmail(finishedSession, results);
    }

    await updateDoc(doc(db, "sessions", sessionId), {
      status: SESSION_STATUS.COMPLETED,
      completedAt: serverTimestamp(),
      overallResult,
      criticalFailure,
      totalPointsEarned,
      failureEmailStatus: failureEmail.status,
      failureEmailRecipients: failureEmail.recipients,
      failureEmailError: failureEmail.error,
    });
  }

  function hasOverallNote() {
    const n = testNoteRef.current ?? testNote;
    return n?.photoURLs?.length > 0 || !!n?.note;
  }

  async function handleNoteDraftPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file);
    setNoteDraftPhotos((prev) => [...prev, dataUrl]);
    e.target.value = "";
  }

  // The one real "end the session" path in this page: computes/records the pass-fail
  // outcome via finishSession(), then either shows Task 9's Test Group continuation popup
  // or navigates to the results screen. Shared by proceed() (normal last-line completion)
  // and confirmStopTest() (Task 10's early-stop path) so an early-stopped session gets
  // exactly the same finishSession() computation and exactly the same Test Group offer as
  // a normally-completed one — no second, parallel "finish" implementation.
  async function finishSessionAndContinue() {
    await finishSession();
    if (sessionData.groupId) {
      setShowGroupContinue(true);
    } else {
      navigate(`/session/${sessionId}/results`, { replace: true });
    }
  }

  async function proceed() {
    if (isLastLine) {
      await finishSessionAndContinue();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  function pauseOverallTimer() {
    clearInterval(overallIntervalRef.current);
    setIsOverallRunning(false);
    setOverallPauseEvents((prev) => [
      ...prev,
      { pausedAtElapsedSeconds: overallElapsed, resumedAtElapsedSeconds: null },
    ]);
  }

  function resumeOverallTimer() {
    overallStartRef.current = Date.now() - overallElapsed * 1000;
    setIsOverallRunning(true);
    overallIntervalRef.current = setInterval(() => {
      setOverallElapsed((Date.now() - overallStartRef.current) / 1000);
    }, 100);
    setOverallPauseEvents((prev) =>
      prev.map((p, i) => (i === prev.length - 1 ? { ...p, resumedAtElapsedSeconds: overallElapsed } : p))
    );
  }

  // Freezes the clock immediately (reusing pauseOverallTimer, so the elapsed reading is
  // stable while the confirmation is up) and opens the "Are you sure?" popup.
  function handleStopTestClick() {
    pauseOverallTimer();
    setShowStopConfirm(true);
  }

  // Cancels an in-flight stop exactly like canceling a pause: reuses resumeOverallTimer so
  // there's no separate "resume after a canceled stop" behavior to maintain.
  function cancelStopTest() {
    setShowStopConfirm(false);
    resumeOverallTimer();
  }

  // Finalizes the Overall Timer line's own pass/fail (all-or-nothing against its threshold,
  // same as the per-step Timer type), records every still-ungraded line as an immediate
  // fail/zero, then ends the session through the exact same finishSessionAndContinue() path
  // used when a test completes normally — so a stopped-early session still gets
  // finishSession()'s pass/fail computation and still offers "Go to Next Test" when this
  // session belongs to a Test Group.
  async function confirmStopTest() {
    const finalElapsed = overallElapsed;
    const result =
      overallTimerLine.passThresholdSecondsSnapshot != null
        ? computeTimerResult(finalElapsed, overallTimerLine.passThresholdSecondsSnapshot)
        : RESULT.PASS;
    const pointsEarned = result === RESULT.PASS ? (overallTimerLine.pointsSnapshot ?? 0) : 0;
    const totalPausedSeconds = overallPauseEvents.reduce(
      (sum, p) => sum + ((p.resumedAtElapsedSeconds ?? finalElapsed) - p.pausedAtElapsedSeconds),
      0
    );

    // Use the same name-addressed patchLine() helper the rest of the page writes through
    // (Task 8), not a hand-rolled updateDoc, so both the Firestore write and the local
    // lineResults/lineResultsRef state stay in sync the same way every other grade does.
    await patchLine(overallTimerLine.id, {
      result,
      pointsEarned,
      elapsedSeconds: finalElapsed,
      pauseEvents: overallPauseEvents,
      totalPausedSeconds,
    });

    const stillUngraded = (lineResultsRef.current ?? lineResults).filter(
      (l) => l.id !== overallTimerLine.id && l.result == null
    );
    await Promise.all(
      stillUngraded.map((l) => patchLine(l.id, { result: RESULT.FAIL, pointsEarned: 0 }))
    );

    setShowStopConfirm(false);
    await finishSessionAndContinue();
  }

  // Creates the next session in the group (same recruit, next templateId in the group's
  // ordered list, groupSequenceIndex + 1) and jumps straight into it, skipping recruit
  // re-selection entirely. Mirrors RecruitConfirmPage's beginTest() session/lineResults
  // seeding — this page has its own recruit/template context (from the just-finished
  // session), so it creates the next session itself rather than routing back through
  // RecruitConfirmPage.
  async function goToNextTest() {
    setCreatingNextTest(true);
    try {
      const nextIndex = sessionData.groupSequenceIndex + 1;
      const nextTemplateId = groupTemplateIds[nextIndex];
      const nextTemplateSnap = await getDoc(doc(db, "templates", nextTemplateId));
      const nextTemplate = { id: nextTemplateSnap.id, ...nextTemplateSnap.data() };

      const linesSnap = await getDocs(
        query(collection(db, "templates", nextTemplateId, "lines"), orderBy("sortOrder"))
      );
      const lines = linesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const totalPointsPossible = lines.reduce(
        (sum, line) => sum + (line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : 0),
        0
      );

      const nextSessionRef = await addDoc(collection(db, "sessions"), {
        recruitId: sessionData.recruitId,
        recruitName: sessionData.recruitName,
        templateId: nextTemplate.id,
        templateName: nextTemplate.name,
        ...(nextTemplate.description ? { templateDescription: nextTemplate.description } : {}),
        evaluatorName: sessionData.evaluatorName,
        attemptType: sessionData.attemptType,
        startedAt: serverTimestamp(),
        completedAt: null,
        status: SESSION_STATUS.IN_PROGRESS,
        overallResult: null,
        criticalFailure: false,
        passingPercentageSnapshot: nextTemplate.passingPercentage ?? 70,
        totalPointsPossible,
        totalPointsEarned: null,
        failureEmailStatus: null,
        groupId: sessionData.groupId,
        groupName: sessionData.groupName,
        groupSequenceIndex: nextIndex,
      });

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
    } finally {
      setCreatingNextTest(false);
    }
  }

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
  }

  // Checklist/Tile equivalent of advance(): those views let the evaluator grade every line
  // out of order with no notion of "current line," so — unlike Standard, which walks forward
  // one line at a time via currentIndex — this checks the *whole* lineResults array at once
  // and, once nothing is missing, submits directly instead of stepping through a hidden index
  // the evaluator never sees (that mismatch was the root cause of the footer's Next/Submit
  // button appearing to do nothing from these views: it was silently advancing currentIndex,
  // which neither view renders).
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

  function returnToHome() {
    if (isTimerRunning) {
      stopTimer();
    }
    navigate("/", { replace: true });
  }

  if (!lineResults || !sessionData) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading test…</div>;
  }

  return (
    <div className="app-shell">
      {showCountdown && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
          }}
        >
          <div className="card" style={{ padding: "40px 56px", textAlign: "center" }}>
            <p className="muted" style={{ marginBottom: 8 }}>Overall Timer starts in</p>
            <div className="countdown-digit" style={{ fontSize: 72, fontWeight: 700 }}>
              {countdownValue}
            </div>
          </div>
        </div>
      )}
      {/* Rendered above/outside Task 8's viewMode branch below, so this whole-test banner and
          its controls show in every view (Standard/Checklist/Tile) and are never affected by
          switching views. */}
      {overallTimerLine && (
        <div className="overall-timer-banner">
          <span className="overall-timer-readout">
            Overall Timer: {formatSeconds(overallElapsed)}s
            {overallTimerLine.result != null && (
              <span
                className={`badge ${overallTimerLine.result === RESULT.PASS ? "pass" : "fail"}`}
                style={{ marginLeft: 10 }}
              >
                {overallTimerLine.result === RESULT.PASS ? "PASS" : "FAIL"}
              </span>
            )}
          </span>
          {overallTimerLine.result == null && (
            <div className="overall-timer-actions">
              <button
                className="secondary"
                onClick={isOverallRunning ? pauseOverallTimer : resumeOverallTimer}
              >
                {isOverallRunning ? "⏸ Pause" : "▶ Resume"}
              </button>
              <button className="primary danger" onClick={handleStopTestClick}>
                ⏹ Stop Test
              </button>
            </div>
          )}
        </div>
      )}

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

      {effectiveViewMode === "standard" && !isObstacleCourse && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${((currentIndex + 1) / lineResults.length) * 100}%`,
                background: "var(--brand-gold)",
              }}
            />
          </div>
          <p className="muted" style={{ textAlign: "center", marginTop: 6 }}>
            Line {currentIndex + 1} of {lineResults.length}
          </p>
        </div>
      )}

      <div className="screen" style={{ flex: 1, paddingTop: isObstacleCourse ? 12 : undefined }}>
        {effectiveViewMode === "standard" ? (
          <LineCard
            current={current}
            isTimerRunning={isTimerRunning}
            elapsed={elapsed}
            startTimer={startTimer}
            stopTimer={stopTimer}
            patchCurrent={patchCurrent}
            setGradedResult={setGradedResult}
          />
        ) : effectiveViewMode === "checklist" ? (
          <ChecklistView
            lineResults={lineResults}
            onGrade={gradeLine}
            onJump={jumpToStandard}
            runningLineId={runningTimerLineIdRef.current}
            isTimerRunning={isTimerRunning}
            elapsed={elapsed}
            onStartTimer={onStartTimer}
            onStopTimer={stopTimer}
          />
        ) : (
          <TileView
            lineResults={lineResults}
            onGrade={gradeLine}
            onJump={jumpToStandard}
            runningLineId={runningTimerLineIdRef.current}
            isTimerRunning={isTimerRunning}
            elapsed={elapsed}
            onStartTimer={onStartTimer}
            onStopTimer={stopTimer}
          />
        )}
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "var(--bg)",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
          display: "flex",
          gap: 12,
        }}
      >
        <button className="secondary" style={{ maxWidth: 140 }} onClick={() => setShowReturnConfirm(true)}>
          Return to Home
        </button>
        {effectiveViewMode === "standard" ? (
          <button className="primary" onClick={advance} disabled={!canAdvance()} style={{ flex: 1 }}>
            {isLastLine ? "Submit" : "Next"}
          </button>
        ) : (
          // Checklist/Tile grade every line out of order with no currentIndex-driven "next
          // line," so unlike Standard there's no intermediate "Next" step — just Submit once
          // every line has a result.
          <button
            className="primary"
            onClick={submitAll}
            disabled={!lineResults.every((l) => l.result != null)}
            style={{ flex: 1 }}
          >
            Submit
          </button>
        )}
      </div>

      {showReturnConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowReturnConfirm(false)}
        >
          <div
            className="card"
            style={{
              maxWidth: 320,
              padding: "24px",
              textAlign: "center",
            }}
          >
            <h3 style={{ marginBottom: 12 }}>Return to Home?</h3>
            <p className="muted" style={{ marginBottom: 20 }}>
              Any unsaved progress on the current step will be lost.
              {isTimerRunning && (
                <>
                  <br />
                  <br />
                  The timer will stop when you confirm.
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => setShowReturnConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="primary danger"
                style={{ flex: 1 }}
                onClick={returnToHome}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showDistanceRequired && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowDistanceRequired(false)}
        >
          <div className="card" style={{ maxWidth: 320, padding: "24px", textAlign: "center" }}>
            <h3 style={{ marginBottom: 12 }}>Distance Required</h3>
            <p className="muted" style={{ marginBottom: 20 }}>
              Select a stopping distance for Obstacle{missingDistanceObstacles.length > 1 ? "s" : ""}{" "}
              {missingDistanceObstacles.join(" and ")} on the course map before submitting.
            </p>
            <button className="primary" style={{ width: "100%" }} onClick={() => setShowDistanceRequired(false)}>
              OK
            </button>
          </div>
        </div>
      )}

      {showNoteRequired && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowNoteRequired(false)}
        >
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
                  await patchTestNote({ note: noteDraft.trim(), photoURLs: noteDraftPhotos });
                  setShowNoteRequired(false);
                  await (noteContinuationRef.current ?? proceed)();
                }}
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showGroupContinue && (
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
            <h3 style={{ marginBottom: 12 }}>Test Complete</h3>
            <p className="muted" style={{ marginBottom: 20 }}>
              {sessionData.groupName}: test {sessionData.groupSequenceIndex + 1} of{" "}
              {groupTemplateIds?.length ?? sessionData.groupSequenceIndex + 1} complete.
              {isMidGroup
                ? " The recruit is already selected — go straight to the next test, or view this test's result first."
                : " That was the last test in this group."}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => navigate(`/session/${sessionId}/results`, { replace: true })}
              >
                View Results
              </button>
              {isMidGroup ? (
                <button className="primary" style={{ flex: 1 }} disabled={creatingNextTest} onClick={goToNextTest}>
                  {creatingNextTest ? "Loading…" : "Go to Next Test"}
                </button>
              ) : (
                <button
                  className="primary"
                  style={{ flex: 1 }}
                  onClick={() =>
                    navigate(`/session-group/${sessionData.groupId}/${sessionData.recruitId}`, { replace: true })
                  }
                >
                  View Group Summary
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showStopConfirm && (
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
            <h3 style={{ marginBottom: 12 }}>Stop Test?</h3>
            <p className="muted" style={{ marginBottom: 20 }}>
              This ends the test now. Any ungraded steps will be recorded as failed with zero
              points.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="secondary" style={{ flex: 1 }} onClick={cancelStopTest}>
                Cancel
              </button>
              <button className="primary danger" style={{ flex: 1 }} onClick={confirmStopTest}>
                Yes, Stop Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function LineCard({ current, isTimerRunning, elapsed, startTimer, stopTimer, patchCurrent, setGradedResult }) {
  if (current.lineTypeSnapshot === LINE_TYPES.INSTRUCTION) {
    return (
      <div className="center-column" style={{ paddingTop: 32 }}>
        <div style={{ fontSize: 40 }}>ℹ️</div>
        <p
          style={{ fontSize: 20, fontWeight: 500 }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.lineTextSnapshot) }}
        />
      </div>
    );
  }

  if (current.lineTypeSnapshot === LINE_TYPES.TIMER) {
    return (
      <div className="center-column" style={{ paddingTop: 16 }}>
        <p
          style={{ fontSize: 20, fontWeight: 500 }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(current.lineTextSnapshot) }}
        />
        {current.passThresholdSecondsSnapshot != null && (
          <p className="muted" style={{ fontWeight: 600 }}>
            Pass: ≤ {current.passThresholdSecondsSnapshot}s · Worth {current.pointsSnapshot ?? 0} pts
            {current.isCriticalSnapshot && <span style={{ color: "var(--brand-red)" }}> · CRITICAL</span>}
          </p>
        )}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: !isTimerRunning && current.result === RESULT.FAIL ? "var(--brand-red)" : undefined,
            margin: "16px 0",
          }}
        >
          {formatSeconds(isTimerRunning ? elapsed : current.timerElapsedSeconds ?? 0)}
        </div>

        {isTimerRunning ? (
          <button className="primary danger" style={{ maxWidth: 320 }} onClick={stopTimer}>
            Stop
          </button>
        ) : current.timerElapsedSeconds == null ? (
          <button className="primary" style={{ maxWidth: 320 }} onClick={() => startTimer(current.id)}>
            Start
          </button>
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

  if (current.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE) {
    return (
      <div className="center-column" style={{ paddingTop: 0 }}>
        <ObstacleCourseRunner current={current} patchCurrent={patchCurrent} />
      </div>
    );
  }

  if (current.lineTypeSnapshot === LINE_TYPES.OVERALL_TIMER) {
    return (
      <div className="center-column" style={{ paddingTop: 32 }}>
        <div style={{ fontSize: 40 }}>⏱️</div>
        <p style={{ fontSize: 20, fontWeight: 500 }}>
          This step is scored automatically by the Overall Timer banner above.
        </p>
        <p className="muted">
          Use "Stop Test" when the recruit finishes — there's nothing to grade manually here.
        </p>
        {current.result != null && (
          <div className={`badge ${current.result === RESULT.PASS ? "pass" : "fail"}`} style={{ fontSize: 16, marginTop: 12 }}>
            {current.result === RESULT.PASS ? "PASS" : "FAIL"}
          </div>
        )}
      </div>
    );
  }

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
