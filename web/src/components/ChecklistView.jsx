import { LINE_TYPES, RESULT, lineDisplayLabel } from "../lib/constants";
import { sanitizeHtml } from "../lib/richText";

/** Shows every line in the test at once, one row per line, so an evaluator can grade
 * out of order instead of stepping through lines one at a time. Plain graded lines get
 * inline Pass/Fail buttons; timer/obstacle-course/instruction lines (which need the full
 * single-step card to record a result) get a "View" button that jumps there instead. */
export default function ChecklistView({ lineResults, onGrade, onJump }) {
  return (
    <div>
      {lineResults.map((line) => {
        const isPlainGraded = line.lineTypeSnapshot === LINE_TYPES.GRADED;
        const statusLabel =
          line.lineTypeSnapshot === LINE_TYPES.INSTRUCTION
            ? "N/A"
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
