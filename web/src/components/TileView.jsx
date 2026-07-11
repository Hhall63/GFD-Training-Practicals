import { LINE_TYPES, RESULT, formatSeconds, lineDisplayLabel } from "../lib/constants";
import { sanitizeHtml } from "../lib/richText";

/** A grid of one tile per line for at-a-glance status across the whole test. Plain graded
 * lines get explicit inline Pass/Fail buttons (mirroring ChecklistView) rather than a
 * single ambiguous tap-to-toggle target, since a mis-tap on an already-graded tile must
 * not be able to silently flip a pass/fail-gated result. Timer lines get inline Start/Stop
 * controls (Task 4), reusing the page's single per-step timer. Tapping an obstacle-course/
 * instruction tile jumps to the Standard single-step card instead, since those line types
 * can't be graded with a single tap. */
export default function TileView({
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
    <div className="tile-grid">
      {lineResults.map((line, index) => {
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
        const statusClass =
          line.result === RESULT.PASS ? "card--pass" : line.result === RESULT.FAIL ? "card--fail" : "";
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
          <div key={line.id} className={`card ${statusClass}`}>
            <span className="tile-seq" aria-hidden="true">
              {index + 1}
            </span>
            <div className="tile-label" dangerouslySetInnerHTML={{ __html: sanitizeHtml(lineDisplayLabel(line)) }} />
            <div className="muted" style={{ marginTop: 6, marginBottom: 8, fontWeight: 600 }}>
              {statusLabel}
            </div>
            {isPlainGraded ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={`primary ${line.result === RESULT.PASS ? "pass-muted" : ""}`}
                  style={{
                    width: "auto",
                    flex: 1,
                    padding: "8px 10px",
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
                    flex: 1,
                    padding: "8px 10px",
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
                  style={{ width: "100%", padding: "8px 10px" }}
                  onClick={onStopTimer}
                >
                  Stop
                </button>
              ) : line.result != null ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`badge ${line.result === RESULT.PASS ? "pass" : "fail"}`}>
                    {line.result === RESULT.PASS ? "PASS" : "FAIL"}
                  </span>
                  <button
                    className="secondary"
                    style={{ width: "auto", flex: 1, padding: "8px 10px" }}
                    disabled={anotherTimerRunning}
                    onClick={() => onStartTimer(line.id)}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <button
                  className="primary"
                  style={{ width: "100%", padding: "8px 10px" }}
                  disabled={anotherTimerRunning}
                  onClick={() => onStartTimer(line.id)}
                >
                  Start
                </button>
              )
            ) : (
              <button
                className="secondary"
                style={{ width: "100%", padding: "8px 10px" }}
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
