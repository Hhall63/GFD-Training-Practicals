import { LINE_TYPES, RESULT, formatSeconds, lineDisplayLabel } from "../lib/constants";
import { sanitizeHtml } from "../lib/richText";

/** Shows every line in the test at once, one row per line, so an evaluator can grade
 * out of order instead of stepping through lines one at a time. Plain graded lines get
 * inline Pass/Fail buttons; Timer lines get inline Start/Stop controls (Task 4), reusing
 * the page's single per-step timer; obstacle-course/instruction lines (which need the full
 * single-step card to record a result) get a "View" button that jumps there instead. */
export default function ChecklistView({
  lineResults,
  onGrade,
  onJump,
  current,
  isTimerRunning,
  elapsed,
  onStartTimer,
  onStopTimer,
}) {
  return (
    <div>
      {lineResults.map((line) => {
        const isPlainGraded = line.lineTypeSnapshot === LINE_TYPES.GRADED;
        const isTimer = line.lineTypeSnapshot === LINE_TYPES.TIMER;
        // This line's own timer is the one currently running — only true for at most one
        // line at a time, since the page has a single intervalRef/isTimerRunning pair.
        const isRunningHere = isTimerRunning && current?.id === line.id;
        // A different line's timer is running. Starting this line's timer right now would
        // reassign the page's single timer mid-flight and strand the other line's run, so
        // Start/Retry are disabled here until that other timer is stopped.
        const anotherTimerRunning = isTimerRunning && current?.id !== line.id;
        const statusLabel =
          line.lineTypeSnapshot === LINE_TYPES.INSTRUCTION
            ? "N/A"
            : isRunningHere
            ? `Running: ${formatSeconds(elapsed)}s`
            : line.result === RESULT.PASS
            ? "PASS"
            : line.result === RESULT.FAIL
            ? "FAIL"
            : "—";

        return (
          <div key={line.id} className="list-row" style={{ cursor: "default" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(lineDisplayLabel(line)) }} />
              <div className="muted">{statusLabel}</div>
            </div>
            {isPlainGraded ? (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  className={`primary ${line.result === RESULT.PASS ? "pass-muted" : ""}`}
                  style={{
                    width: "auto",
                    padding: "8px 14px",
                    background: line.result === RESULT.PASS ? undefined : "#c7c7cc",
                  }}
                  onClick={() => onGrade(line.id, RESULT.PASS)}
                >
                  Pass
                </button>
                <button
                  className={`primary ${line.result === RESULT.FAIL ? "fail-muted" : ""}`}
                  style={{
                    width: "auto",
                    padding: "8px 14px",
                    background: line.result === RESULT.FAIL ? undefined : "#c7c7cc",
                  }}
                  onClick={() => onGrade(line.id, RESULT.FAIL)}
                >
                  Fail
                </button>
              </div>
            ) : isTimer ? (
              isRunningHere ? (
                <button
                  className="primary danger"
                  style={{ width: "auto", padding: "8px 14px", flexShrink: 0 }}
                  onClick={onStopTimer}
                >
                  Stop
                </button>
              ) : line.result != null ? (
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  <span className={`badge ${line.result === RESULT.PASS ? "pass" : "fail"}`}>
                    {line.result === RESULT.PASS ? "PASS" : "FAIL"}
                  </span>
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "8px 14px" }}
                    disabled={anotherTimerRunning}
                    onClick={() => onStartTimer(line.id)}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <button
                  className="primary"
                  style={{ width: "auto", padding: "8px 14px", flexShrink: 0 }}
                  disabled={anotherTimerRunning}
                  onClick={() => onStartTimer(line.id)}
                >
                  Start
                </button>
              )
            ) : (
              <button
                className="secondary"
                style={{ width: "auto", padding: "8px 14px", flexShrink: 0 }}
                onClick={() => onJump(line.id)}
              >
                View
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
