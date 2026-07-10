import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { compressImageToDataUrl } from "../lib/image";
import { sendFailureEmail } from "../lib/notify";
import { computeTimerResult, formatSeconds, LINE_TYPES, RESULT, SESSION_STATUS } from "../lib/constants";
import { missingRequiredDistances } from "../lib/obstacleCourse";
import { sanitizeHtml } from "../lib/richText";
import ObstacleCourseRunner from "../components/ObstacleCourseRunner";
import ChecklistView from "../components/ChecklistView";
import TileView from "../components/TileView";

export default function LiveTestRunnerPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [sessionData, setSessionData] = useState(null);
  const [lineResults, setLineResults] = useState(null);
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
  const [noteRequiredReason, setNoteRequiredReason] = useState("stepFailed"); // "stepFailed" | "overallFail"
  const timerStartRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSessionData(snap.data()));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then(
      (snap) => {
        const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        lineResultsRef.current = results;
        setLineResults(results);
      }
    );
  }, [sessionId]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const current = lineResults?.[currentIndex];
  const isLastLine = lineResults && currentIndex === lineResults.length - 1;
  // The obstacle course is a full-screen dashboard with its own controls, so the test
  // chrome (progress bar, "Line X of Y", and the step's own title) just gets in the way.
  const isObstacleCourse = current?.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE;

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

  // Name-addressed grading for the Checklist/Tile views, which show every line at once and
  // let the evaluator grade any of them without making it "current" first. Generalizes
  // setGradedResult (below), which only ever grades `current`.
  async function gradeLine(lineId, result) {
    const line = lineResultsRef.current?.find((l) => l.id === lineId);
    if (!line) return;
    const pointsEarned = result === RESULT.PASS ? (line.pointsSnapshot ?? 0) : 0;
    await patchLine(lineId, { result, pointsEarned });
  }

  // Used by the Checklist/Tile views to open a line (timer/obstacle-course/instruction)
  // that can't be graded with a single tap in the Standard single-step card instead.
  function jumpToStandard(lineId) {
    const index = lineResults.findIndex((l) => l.id === lineId);
    if (index === -1) return;
    setCurrentIndex(index);
    setViewMode("standard");
  }

  function startTimer() {
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
    const finalElapsed = (Date.now() - timerStartRef.current) / 1000;
    const result = computeTimerResult(finalElapsed, current.passThresholdSecondsSnapshot);
    // All-or-nothing: full points for finishing within the time limit, zero otherwise.
    const pointsEarned = result === RESULT.PASS ? (current.pointsSnapshot ?? 0) : 0;
    await patchCurrent({ timerElapsedSeconds: finalElapsed, result, pointsEarned });
  }

  function setGradedResult(result) {
    const pointsEarned = result === RESULT.PASS ? (current.pointsSnapshot ?? 0) : 0;
    return patchCurrent({ result, pointsEarned });
  }

  function canAdvance() {
    if (!current) return false;
    if (current.lineTypeSnapshot === LINE_TYPES.INSTRUCTION) return true;
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

  function hasFailNote() {
    return current.photoURLs?.length > 0 || !!current.note;
  }

  async function proceed() {
    if (isLastLine) {
      await finishSession();
      navigate(`/session/${sessionId}/results`, { replace: true });
    } else {
      setCurrentIndex((i) => i + 1);
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
    // A failed step must be documented before moving on — a blocking pop-up (with a note
    // field) rather than a silently disabled button.
    if (current.result === RESULT.FAIL && !hasFailNote()) {
      setNoteDraft(current.note ?? "");
      setNoteRequiredReason("stepFailed");
      setShowNoteRequired(true);
      return;
    }
    // The obstacle course (and any scored step) only sets its own result to FAIL on a hard
    // auto-fail trigger — a low but non-auto-fail score still reports PASS on the step even
    // though it can drag the overall test below the passing percentage. So on the last line,
    // also preview the overall outcome and require a note if the *test* is about to fail,
    // even when this step's own result isn't FAIL.
    if (isLastLine && current.lineTypeSnapshot !== LINE_TYPES.INSTRUCTION && !hasFailNote()) {
      const { overallResult } = computeSessionOutcome(lineResultsRef.current ?? lineResults);
      if (overallResult === RESULT.FAIL) {
        setNoteDraft(current.note ?? "");
        setNoteRequiredReason("overallFail");
        setShowNoteRequired(true);
        return;
      }
    }
    await proceed();
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
      {isTimerRunning && (
        <div className="timer-banner">
          <span>Timer running: {formatSeconds(elapsed)}s</span>
          <button onClick={stopTimer}>Stop</button>
        </div>
      )}

      <div style={{ padding: "12px 16px 0", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        <ViewSwitcher viewMode={viewMode} setViewMode={setViewMode} />
      </div>

      {viewMode === "standard" && !isObstacleCourse && (
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ height: 6, background: "#e1e1e8", borderRadius: 3, overflow: "hidden" }}>
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
        {viewMode === "standard" ? (
          <LineCard
            current={current}
            isTimerRunning={isTimerRunning}
            elapsed={elapsed}
            startTimer={startTimer}
            stopTimer={stopTimer}
            patchCurrent={patchCurrent}
            setGradedResult={setGradedResult}
          />
        ) : viewMode === "checklist" ? (
          <ChecklistView lineResults={lineResults} onGrade={gradeLine} onJump={jumpToStandard} />
        ) : (
          <TileView lineResults={lineResults} onGrade={gradeLine} onJump={jumpToStandard} />
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
        <button className="primary" onClick={advance} disabled={!canAdvance()} style={{ flex: 1 }}>
          {isLastLine ? "Submit" : "Next"}
        </button>
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
              {noteRequiredReason === "overallFail"
                ? "This test does not meet the passing score. Add a note explaining what happened before submitting."
                : "This step was failed. Add a note explaining what happened before continuing."}
            </p>
            <textarea
              autoFocus
              rows={3}
              placeholder="What did the recruit fail on?"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button className="secondary" style={{ flex: 1 }} onClick={() => setShowNoteRequired(false)}>
                Cancel
              </button>
              <button
                className="primary"
                style={{ flex: 1 }}
                disabled={!noteDraft.trim()}
                onClick={async () => {
                  await patchCurrent({ note: noteDraft.trim() });
                  setShowNoteRequired(false);
                  await proceed();
                }}
              >
                Save & Continue
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
          <button className="primary" style={{ maxWidth: 320 }} onClick={startTimer}>
            Start
          </button>
        ) : (
          <>
            <div className={`badge ${current.result === RESULT.PASS ? "pass" : "fail"}`} style={{ fontSize: 16, marginBottom: 12 }}>
              {current.result === RESULT.PASS ? "PASS" : "FAIL"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="secondary" onClick={startTimer}>Retry</button>
              <button
                className="secondary"
                onClick={() => setGradedResult(current.result === RESULT.PASS ? RESULT.FAIL : RESULT.PASS)}
              >
                Mark {current.result === RESULT.PASS ? "Fail" : "Pass"} Instead
              </button>
            </div>
            {current.result && (
              <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={current.result === RESULT.FAIL} />
            )}
          </>
        )}
      </div>
    );
  }

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
        <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={current.result === RESULT.FAIL} />
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
