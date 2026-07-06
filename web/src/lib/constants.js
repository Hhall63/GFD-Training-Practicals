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
