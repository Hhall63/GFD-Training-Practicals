import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import ObstacleCourseRunner from "../components/ObstacleCourseRunner";

export default function LiveTestRunnerPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [sessionData, setSessionData] = useState(null);
  const [lineResults, setLineResults] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const timerStartRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSessionData(snap.data()));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then(
      (snap) => setLineResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [sessionId]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const current = lineResults?.[currentIndex];
  const isLastLine = lineResults && currentIndex === lineResults.length - 1;

  function patchCurrent(fields) {
    setLineResults((prev) => {
      const copy = [...prev];
      copy[currentIndex] = { ...copy[currentIndex], ...fields };
      return copy;
    });
    return updateDoc(doc(db, "sessions", sessionId, "lineResults", current.id), fields);
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
    if (!current.result) return false;
    if (current.result === RESULT.FAIL) {
      return current.photoURLs?.length > 0 || !!current.note;
    }
    return true;
  }

  async function finishSession() {
    const graded = lineResults.filter((l) => l.lineTypeSnapshot !== LINE_TYPES.INSTRUCTION);
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

    const finishedSession = {
      ...sessionData,
      overallResult,
      criticalFailure,
      totalPointsEarned,
      totalPointsPossible,
    };

    // On a failure, email the admins who opted into failure notifications. Best-effort:
    // a failed/unconfigured send never blocks the evaluator — the Results screen shows
    // the outcome and offers a manual compose button as backup.
    let failureEmailStatus = null;
    if (overallResult === RESULT.FAIL) {
      failureEmailStatus = await sendFailureEmail(finishedSession, lineResults);
    }

    await updateDoc(doc(db, "sessions", sessionId), {
      status: SESSION_STATUS.COMPLETED,
      completedAt: serverTimestamp(),
      overallResult,
      criticalFailure,
      totalPointsEarned,
      failureEmailStatus,
    });
  }

  async function advance() {
    if (isLastLine) {
      await finishSession();
      navigate(`/session/${sessionId}/results`, { replace: true });
    } else {
      setCurrentIndex((i) => i + 1);
    }
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

      <div className="screen" style={{ flex: 1 }}>
        <LineCard
          current={current}
          isTimerRunning={isTimerRunning}
          elapsed={elapsed}
          startTimer={startTimer}
          stopTimer={stopTimer}
          patchCurrent={patchCurrent}
          setGradedResult={setGradedResult}
        />
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
          {isLastLine ? "Finish" : "Next"}
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
    </div>
  );
}

function LineCard({ current, isTimerRunning, elapsed, startTimer, stopTimer, patchCurrent, setGradedResult }) {
  if (current.lineTypeSnapshot === LINE_TYPES.INSTRUCTION) {
    return (
      <div className="center-column" style={{ paddingTop: 32 }}>
        <div style={{ fontSize: 40 }}>ℹ️</div>
        <p style={{ fontSize: 20, fontWeight: 500 }}>{current.lineTextSnapshot}</p>
      </div>
    );
  }

  if (current.lineTypeSnapshot === LINE_TYPES.TIMER) {
    return (
      <div className="center-column" style={{ paddingTop: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 500 }}>{current.lineTextSnapshot}</p>
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
      <div className="center-column" style={{ paddingTop: 16 }}>
        <p style={{ fontSize: 20, fontWeight: 500 }}>{current.lineTextSnapshot}</p>
        <ObstacleCourseRunner current={current} patchCurrent={patchCurrent} />
        {current.result && (
          <AttachmentCapture current={current} patchCurrent={patchCurrent} isRequired={current.result === RESULT.FAIL} />
        )}
      </div>
    );
  }

  // Graded line
  return (
    <div className="center-column" style={{ paddingTop: 16 }}>
      <p style={{ fontSize: 20, fontWeight: 500 }}>{current.lineTextSnapshot}</p>
      <p className="muted" style={{ fontWeight: 600 }}>
        Worth {current.pointsSnapshot ?? 0} pts
        {current.isCriticalSnapshot && <span style={{ color: "var(--brand-red)" }}> · CRITICAL</span>}
      </p>
      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 400, marginTop: 16 }}>
        <button
          className={`primary ${current.result === RESULT.PASS ? "success" : ""}`}
          style={{ background: current.result === RESULT.PASS ? undefined : "#c7c7cc" }}
          onClick={() => setGradedResult(RESULT.PASS)}
        >
          Pass
        </button>
        <button
          className={`primary ${current.result === RESULT.FAIL ? "danger" : ""}`}
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

  function saveNote() {
    patchCurrent({ note });
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
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
          />
        </div>
      )}
    </div>
  );
}
