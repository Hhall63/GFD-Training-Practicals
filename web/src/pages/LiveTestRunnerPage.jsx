import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import { computeTimerResult, formatSeconds, LINE_TYPES, RESULT, SESSION_STATUS } from "../lib/constants";

export default function LiveTestRunnerPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [lineResults, setLineResults] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerStartRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
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
    await patchCurrent({ timerElapsedSeconds: finalElapsed, result });
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
    const overallResult = graded.some((l) => l.result === RESULT.FAIL) ? RESULT.FAIL : RESULT.PASS;
    await updateDoc(doc(db, "sessions", sessionId), {
      status: SESSION_STATUS.COMPLETED,
      completedAt: serverTimestamp(),
      overallResult,
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

  if (!lineResults) {
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
        <LineCard current={current} isTimerRunning={isTimerRunning} elapsed={elapsed} startTimer={startTimer} stopTimer={stopTimer} patchCurrent={patchCurrent} sessionId={sessionId} />
      </div>

      <div style={{ position: "sticky", bottom: 0, background: "var(--bg)", padding: 16, display: "flex", gap: 12 }}>
        {currentIndex > 0 && (
          <button className="secondary" style={{ maxWidth: 120 }} onClick={() => setCurrentIndex((i) => i - 1)}>
            Back
          </button>
        )}
        <button className="primary" onClick={advance} disabled={!canAdvance()}>
          {isLastLine ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}

function LineCard({ current, isTimerRunning, elapsed, startTimer, stopTimer, patchCurrent, sessionId }) {
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
            Pass: ≤ {current.passThresholdSecondsSnapshot}s
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
                onClick={() => patchCurrent({ result: current.result === RESULT.PASS ? RESULT.FAIL : RESULT.PASS })}
              >
                Mark {current.result === RESULT.PASS ? "Fail" : "Pass"} Instead
              </button>
            </div>
            {current.result && (
              <AttachmentCapture current={current} patchCurrent={patchCurrent} sessionId={sessionId} isRequired={current.result === RESULT.FAIL} />
            )}
          </>
        )}
      </div>
    );
  }

  // Graded line
  return (
    <div className="center-column" style={{ paddingTop: 16 }}>
      <p style={{ fontSize: 20, fontWeight: 500 }}>{current.lineTextSnapshot}</p>
      <div style={{ display: "flex", gap: 12, width: "100%", maxWidth: 400, marginTop: 16 }}>
        <button
          className={`primary ${current.result === RESULT.PASS ? "success" : ""}`}
          style={{ background: current.result === RESULT.PASS ? undefined : "#c7c7cc" }}
          onClick={() => patchCurrent({ result: RESULT.PASS })}
        >
          Pass
        </button>
        <button
          className={`primary ${current.result === RESULT.FAIL ? "danger" : ""}`}
          style={{ background: current.result === RESULT.FAIL ? undefined : "#c7c7cc" }}
          onClick={() => patchCurrent({ result: RESULT.FAIL })}
        >
          Fail
        </button>
      </div>
      {current.result && (
        <AttachmentCapture current={current} patchCurrent={patchCurrent} sessionId={sessionId} isRequired={current.result === RESULT.FAIL} />
      )}
    </div>
  );
}

function AttachmentCapture({ current, patchCurrent, sessionId, isRequired }) {
  const [note, setNote] = useState(current.note ?? "");
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(isRequired);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `attachments/${sessionId}/${current.id}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await patchCurrent({ photoURLs: [...(current.photoURLs ?? []), url] });
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
