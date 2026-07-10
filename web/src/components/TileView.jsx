import { LINE_TYPES, RESULT, lineDisplayLabel } from "../lib/constants";
import { sanitizeHtml } from "../lib/richText";

/** A grid of one tile per line for at-a-glance status across the whole test. Plain graded
 * lines get explicit inline Pass/Fail buttons (mirroring ChecklistView) rather than a
 * single ambiguous tap-to-toggle target, since a mis-tap on an already-graded tile must
 * not be able to silently flip a pass/fail-gated result. Tapping a timer/obstacle-course/
 * instruction tile jumps to the Standard single-step card instead, since those line types
 * can't be graded with a single tap. */
export default function TileView({ lineResults, onGrade, onJump }) {
  return (
    <div className="tile-grid">
      {lineResults.map((line) => {
        const isPlainGraded = line.lineTypeSnapshot === LINE_TYPES.GRADED;
        const statusClass =
          line.result === RESULT.PASS ? "card--pass" : line.result === RESULT.FAIL ? "card--fail" : "";
        const statusLabel =
          line.lineTypeSnapshot === LINE_TYPES.INSTRUCTION
            ? "N/A"
            : line.result === RESULT.PASS
            ? "PASS"
            : line.result === RESULT.FAIL
            ? "FAIL"
            : "—";

        return (
          <div key={line.id} className={`card ${statusClass}`}>
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(lineDisplayLabel(line)) }} />
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
