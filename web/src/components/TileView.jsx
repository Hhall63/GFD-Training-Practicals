import { LINE_TYPES, RESULT, lineDisplayLabel } from "../lib/constants";
import { sanitizeHtml } from "../lib/richText";

/** A grid of one tile per line for at-a-glance status across the whole test. Tapping a
 * plain graded tile toggles its result directly (pass -> fail -> pass, no navigation);
 * tapping a timer/obstacle-course/instruction tile jumps to the Standard single-step
 * card instead, since those line types can't be graded with a single tap. */
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
            : isPlainGraded
            ? "Tap to grade"
            : "Tap to view";

        function handleTap() {
          if (isPlainGraded) {
            onGrade(line.id, line.result === RESULT.PASS ? RESULT.FAIL : RESULT.PASS);
          } else {
            onJump(line.id);
          }
        }

        return (
          <button
            key={line.id}
            className={`card ${statusClass}`}
            style={{
              textAlign: "left",
              cursor: "pointer",
              width: "100%",
              font: "inherit",
              color: "inherit",
            }}
            onClick={handleTap}
          >
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(lineDisplayLabel(line)) }} />
            <div className="muted" style={{ marginTop: 6, fontWeight: 600 }}>
              {statusLabel}
            </div>
          </button>
        );
      })}
    </div>
  );
}
