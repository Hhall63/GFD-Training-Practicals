export const LINE_TYPES = {
  INSTRUCTION: "instruction",
  GRADED: "graded",
  TIMER: "timer",
  OBSTACLE_COURSE: "obstacleCourse",
};

export const LINE_TYPE_LABELS = {
  [LINE_TYPES.INSTRUCTION]: "Instruction",
  [LINE_TYPES.GRADED]: "Graded Step",
  [LINE_TYPES.TIMER]: "Timer",
  [LINE_TYPES.OBSTACLE_COURSE]: "Obstacle Course",
};

/** The label to show for a test step. The obstacle course is a fixed department form, so
 * it always shows its own name rather than a free-text description an evaluator may have
 * typed (or left as junk) when building the template. Every other step shows its text.
 * Accepts either a live template line (`lineType`/`lineText`) or a snapshotted line result
 * (`lineTypeSnapshot`/`lineTextSnapshot`). */
export function lineDisplayLabel(line) {
  const type = line?.lineType ?? line?.lineTypeSnapshot;
  if (type === LINE_TYPES.OBSTACLE_COURSE) return LINE_TYPE_LABELS[LINE_TYPES.OBSTACLE_COURSE];
  return line?.lineText ?? line?.lineTextSnapshot ?? "";
}

export const RESULT = {
  PASS: "pass",
  FAIL: "fail",
  NOT_APPLICABLE: "n/a",
};

export const SESSION_STATUS = {
  IN_PROGRESS: "inProgress",
  COMPLETED: "completed",
};

/** Compares an elapsed timer reading against the pass/fail cutoff so the evaluator never
 * has to do the math themselves. */
export function computeTimerResult(elapsedSeconds, passThresholdSeconds) {
  if (passThresholdSeconds == null) return RESULT.PASS;
  return elapsedSeconds <= passThresholdSeconds ? RESULT.PASS : RESULT.FAIL;
}

export function formatSeconds(seconds) {
  return (Math.round(seconds * 10) / 10).toFixed(1);
}

export function initials(firstName, lastName) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}
