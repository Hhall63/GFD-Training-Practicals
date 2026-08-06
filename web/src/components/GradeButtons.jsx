import { RESULT } from "../lib/constants";

const SIZE_STYLE = {
  // Standard single-step card: full .primary sizing, no override.
  large: undefined,
  // Checklist row: content-width, doesn't stretch to fill the row.
  row: {
    width: "auto",
    minHeight: 44,
    padding: "8px 14px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // Tile grid: fills its half of the tile.
  grid: {
    width: "auto",
    flex: 1,
    minHeight: 44,
    padding: "8px 10px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
};

/** Pass/Fail button pair for a GRADED line. Before grading, both buttons read as equal,
 * clearly-legible secondary actions (`.grade-pending` — navy on transparent, same contrast
 * class used everywhere else in the app) instead of the old inline `#c7c7cc` fill, which
 * rendered white-on-light-gray at ~1.7:1 contrast — nearly invisible on the screen an
 * evaluator reads mid-test, in daylight, under a clock. Once graded, the selected result
 * goes solid (pass-muted/fail-muted); the other returns to the pending look. `row`/`grid`
 * sizes also guarantee the 44px glove-ready floor, which the old inline padding didn't.
 *
 * One implementation shared by the Standard card, Checklist, and Tile views — previously
 * three independently hand-copied (and independently broken) button pairs. */
export default function GradeButtons({ result, onGrade, size = "large" }) {
  const style = SIZE_STYLE[size];
  return (
    <>
      <button
        className={`primary ${result === RESULT.PASS ? "pass-muted" : "grade-pending"}`}
        style={style}
        onClick={() => onGrade(RESULT.PASS)}
      >
        Pass
      </button>
      <button
        className={`primary ${result === RESULT.FAIL ? "fail-muted" : "grade-pending"}`}
        style={style}
        onClick={() => onGrade(RESULT.FAIL)}
      >
        Fail
      </button>
    </>
  );
}
