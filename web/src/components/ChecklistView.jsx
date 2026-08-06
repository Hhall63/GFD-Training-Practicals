import { LINE_TYPES, RESULT, formatSeconds, lineDisplayLabel } from "../lib/constants";
import { sanitizeHtml } from "../lib/richText";
import GradeButtons from "./GradeButtons";

// Shared sizing for the Start/Stop/Retry/View action buttons below (not GradeButtons' own
// pair, which sets its own sizing) — 44px glove-ready floor, per PRODUCT.md.
const actionButtonStyle = {
  width: "auto",
  minHeight: 44,
  padding: "8px 14px",
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

/** Shows every line in the test at once, one row per line, so an evaluator can grade
 * out of order instead of stepping through lines one at a time. Plain graded lines get
 * inline Pass/Fail buttons; Timer lines get inline Start/Stop controls (Task 4), reusing
 * the page's single per-step timer; obstacle-course/instruction lines (which need the full
 * single-step card to record a result) get a "View" button that jumps there instead. */
export default function ChecklistView({
  lineResults,
  onGrade,
  onJump,
  runningLineId,
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
        // This line's own timer is the one currently running — keyed off runningTimerLineIdRef
        // (via the runningLineId prop), not `current`, since currentIndex can move off the
        // running line (e.g. tapping "View" on another line) while the timer keeps running.
        // Using `current` here previously meant navigating away could make the actually-
        // running tile show a disabled "Start" instead of "Stop", and make whatever tile
        // WAS current show as startable even though a timer was already live elsewhere.
        const isRunningHere = isTimerRunning && runningLineId === line.id;
        // A different line's timer is running. Starting this line's timer right now would
        // reassign the page's single timer mid-flight and strand the other line's run, so
        // Start/Retry are disabled here until that other timer is stopped.
        const anotherTimerRunning = isTimerRunning && runningLineId !== line.id;
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
                <GradeButtons result={line.result} onGrade={(result) => onGrade(line.id, result)} size="row" />
              </div>
            ) : isTimer ? (
              isRunningHere ? (
                <button className="primary danger" style={actionButtonStyle} onClick={onStopTimer}>
                  Stop
                </button>
              ) : line.result != null ? (
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  <span className={`badge ${line.result === RESULT.PASS ? "pass" : "fail"}`}>
                    {line.result === RESULT.PASS ? "PASS" : "FAIL"}
                  </span>
                  <button
                    className="secondary"
                    style={actionButtonStyle}
                    disabled={anotherTimerRunning}
                    onClick={() => onStartTimer(line.id)}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <button
                  className="primary"
                  style={actionButtonStyle}
                  disabled={anotherTimerRunning}
                  onClick={() => onStartTimer(line.id)}
                >
                  Start
                </button>
              )
            ) : (
              <button className="secondary" style={actionButtonStyle} onClick={() => onJump(line.id)}>
                View
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
