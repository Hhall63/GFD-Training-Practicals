/**
 * Scoring logic for the "Obstacle Course" line type — the GFD SRFF Promotional Process
 * driving/EVD evaluation. It is scored by a tiered driving time (base score) minus
 * per-penalty deductions, with three independent automatic-failure triggers: too many cone
 * penalties, too much total time, and an evaluator-flagged aggressive-driving critical
 * failure.
 *
 * The course itself (penalty values, time tiers, and auto-fail thresholds) is a FIXED
 * department form, so it is baked in here rather than configured per template — the
 * evaluator never has to "build" it. `defaultObstacleCourseConfig()` is the single source
 * of truth for those numbers; a copy is snapshotted onto each session at test-start so a
 * future form change never rewrites past results.
 *
 * The evaluator records penalties by tapping the course diagram, so the raw tally is a
 * flat list of position-tagged markers rather than per-obstacle counters:
 *
 *   config  = { timeTiers: [{ maxSeconds, points }], maxConePenalties, maxTotalSeconds }
 *   tallies = { totalSeconds, markers: [{ x, y, type }] }   // x,y are 0..1 of the image
 *
 * where `type` is one of MARKER_TYPES' keys below.
 */

// Penalty types and their point deductions, straight from the form's
// "Penalties and Scoring" table. `short` is the pin label drawn on the map.
export const MARKER_TYPES = [
  { key: "cone", label: "Cone hit", short: "C", points: 4, color: "#c4212f" },
  { key: "line", label: "Line crossed", short: "L", points: 2, color: "#1f6feb" },
  { key: "stopLine", label: "Stop line hit", short: "S", points: 10, color: "#7d2ae8" },
  // A discrete, deliberate critical event rather than a per-obstacle penalty — worth no
  // points on its own (it isn't a deduction, it's an outright course failure) and excluded
  // from TAP_MARKER_TYPES below since it needs its own confirm-with-required-note flow, not
  // the free-tap-anywhere behavior the other penalty types get.
  { key: "aggressiveDriving", label: "Aggressive Driving (Critical Failure)", short: "AD", points: 0, color: "#111111" },
  { key: "dist0", label: 'Stopped 0"–12"', short: "⓪", points: 0, color: "#2f9e44" },
  { key: "dist1", label: 'Stopped 12"–24"', short: "①", points: 2, color: "#d98200" },
  { key: "dist2", label: 'Stopped 25"–36"', short: "②", points: 4, color: "#d98200" },
  { key: "dist3", label: 'Stopped 37"+', short: "③", points: 6, color: "#d98200" },
  // Recruits who wash out before reaching the obstacle-5 stop never get a measured
  // distance. "Did not finish" satisfies the required-distance gate (its key starts with
  // "dist") but carries no penalty, so no score is associated with a stop they never made.
  { key: "distDNF", label: "Did not finish", short: "DNF", points: 0, color: "#6b7280" },
];

const POINTS_BY_TYPE = Object.fromEntries(MARKER_TYPES.map((m) => [m.key, m.points]));
const LABEL_BY_TYPE = Object.fromEntries(MARKER_TYPES.map((m) => [m.key, m.label]));

// The two spots on the form where a stopping distance is measured (obstacle-2 and
// obstacle-5 penalty stops). Fixed positions (fractions of the diagram) rather than
// free-tap markers — the evaluator reads the measured inches off a tape and picks the
// matching tier from a dropdown anchored right on the map, which grades it automatically.
// Both are required before a run can be finished.
export const DISTANCE_SLOTS = [
  { key: "a", x: 0.13, y: 0.86, obstacleNumber: 2 }, // obstacle 2 stop (chicane, bottom-left)
  { key: "b", x: 0.28, y: 0.86, obstacleNumber: 5 }, // obstacle 5 stop (left straight alley)
];

// The mode buttons on the live runner only cover penalties placed by a free tap anywhere
// on the course; stopping-distance tiers are graded from the DISTANCE_SLOTS dropdowns
// instead, and Aggressive Driving gets its own dedicated confirm-with-note button instead
// of a tap-to-place mode.
export const TAP_MARKER_TYPES = MARKER_TYPES.filter(
  (m) => !m.key.startsWith("dist") && m.key !== "aggressiveDriving"
);

// Both obstacle-2 and obstacle-5 stopping distances must be recorded before a run can be
// finished. Returns the obstacle numbers still missing a distance tier (including the
// 0"–12" no-penalty tier, which still counts as "recorded"); empty once both are set.
export function missingRequiredDistances(tallies) {
  const markers = Array.isArray(tallies?.markers) ? tallies.markers : [];
  return DISTANCE_SLOTS.filter(
    (slot) =>
      !markers.some(
        (m) => m.x === slot.x && m.y === slot.y && typeof m.type === "string" && m.type.startsWith("dist")
      )
  ).map((slot) => slot.obstacleNumber);
}

export function hasRequiredDistance(tallies) {
  return missingRequiredDistances(tallies).length === 0;
}

export function defaultObstacleCourseConfig() {
  return {
    timeTiers: [
      { maxSeconds: 210, points: 100 }, // < 3:30
      { maxSeconds: 225, points: 96 }, // 3:30–3:44
      { maxSeconds: 240, points: 92 }, // 3:45–3:59
      { maxSeconds: 255, points: 88 }, // 4:00–4:14
      { maxSeconds: 270, points: 84 }, // 4:15–4:29
      { maxSeconds: null, points: 80 }, // 4:30+
    ],
    maxConePenalties: 6, // 6 or more cone penalties = automatic failure
    maxTotalSeconds: 390, // over 6:30 on time = automatic failure
  };
}

export function seedObstacleTallies() {
  return { totalSeconds: null, markers: [] };
}

/** Returns the tally's marker list, converting the older per-obstacle counter shape to
 * markers on the fly so any pre-existing sessions still score/summarize correctly. */
function normalizeMarkers(tallies) {
  if (Array.isArray(tallies?.markers)) return tallies.markers;
  const out = [];
  for (const o of tallies?.obstacles ?? []) {
    for (let i = 0; i < (o.cones ?? 0); i++) out.push({ type: "cone" });
    for (let i = 0; i < (o.lineCrossings ?? 0); i++) out.push({ type: "line" });
    if (o.stopLine) out.push({ type: "stopLine" });
    if (o.stoppingDistanceTier > 0) out.push({ type: `dist${o.stoppingDistanceTier}` });
  }
  return out;
}

function scoreForTime(timeTiers, totalSeconds) {
  for (const tier of timeTiers ?? []) {
    if (tier.maxSeconds == null || totalSeconds <= tier.maxSeconds) return tier.points;
  }
  return 0;
}

/** Turns raw tallies into a final 0–100 score plus the three automatic-failure flags — the
 * one place the math lives, shared by the live runner, results/reporting, and CSV. */
export function computeObstacleCourseScore(config, tallies) {
  const cfg = config ?? defaultObstacleCourseConfig();
  const totalSeconds = tallies?.totalSeconds ?? 0;
  const baseScore = scoreForTime(cfg.timeTiers, totalSeconds);

  const markers = normalizeMarkers(tallies);
  let deductions = 0;
  let totalCones = 0;
  let totalLineCrossings = 0;
  for (const m of markers) {
    deductions += POINTS_BY_TYPE[m.type] ?? 0;
    if (m.type === "cone") totalCones++;
    if (m.type === "line") totalLineCrossings++;
  }

  const autoFailCones = totalCones >= (cfg.maxConePenalties ?? Infinity);
  const autoFailTime = totalSeconds >= (cfg.maxTotalSeconds ?? Infinity);
  const autoFailAggressiveDriving = markers.some((m) => m.type === "aggressiveDriving");
  const score = Math.max(0, Math.round(baseScore - deductions));

  return {
    baseScore,
    deductions,
    totalCones,
    totalLineCrossings,
    markerCount: markers.length,
    autoFailCones,
    autoFailTime,
    autoFailAggressiveDriving,
    autoFail: autoFailCones || autoFailTime || autoFailAggressiveDriving,
    score,
  };
}

/** Count of markers by type key, e.g. { cone: 3, line: 1 }. */
export function countMarkersByType(tallies) {
  const counts = {};
  for (const m of normalizeMarkers(tallies)) counts[m.type] = (counts[m.type] ?? 0) + 1;
  return counts;
}

export function formatClock(seconds) {
  const s = Math.max(0, seconds ?? 0);
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${rem}`;
}

/** Multi-line, human-readable breakdown for the failure-notification email's test sheet. */
export function summarizeObstacleCourseLines(config, tallies) {
  const scoring = computeObstacleCourseScore(config, tallies);
  const counts = countMarkersByType(tallies);
  const lines = [];
  lines.push(`Total time: ${formatClock(tallies?.totalSeconds)} (base score ${scoring.baseScore})`);
  for (const mt of MARKER_TYPES) {
    if (counts[mt.key]) lines.push(`${mt.label}: ${counts[mt.key]} (-${counts[mt.key] * mt.points})`);
  }
  lines.push(`Deductions: -${scoring.deductions} -> Final score: ${scoring.score}/100`);
  if (scoring.autoFailCones) {
    lines.push(`AUTOMATIC FAILURE: ${scoring.totalCones} cone penalties (max ${config?.maxConePenalties ?? 6})`);
  }
  if (scoring.autoFailTime) {
    lines.push(`AUTOMATIC FAILURE: total time ${formatClock(tallies?.totalSeconds)} exceeded ${formatClock(config?.maxTotalSeconds ?? 390)}`);
  }
  if (scoring.autoFailAggressiveDriving) {
    lines.push("AUTOMATIC FAILURE: Aggressive driving critical failure");
  }
  return lines;
}

/** One-line summary for the CSV export's additive trailing column. */
export function summarizeObstacleCourseOneLine(config, tallies) {
  const scoring = computeObstacleCourseScore(config, tallies);
  const counts = countMarkersByType(tallies);
  const stopPenalties = (counts.stopLine ?? 0) + (counts.dist1 ?? 0) + (counts.dist2 ?? 0) + (counts.dist3 ?? 0);
  return `time ${formatClock(tallies?.totalSeconds)}, ${scoring.totalCones} cones, ${scoring.totalLineCrossings} line crossings, ${stopPenalties} stop penalties, score ${scoring.score}/100${scoring.autoFail ? " (AUTO-FAIL)" : ""}`;
}

export { LABEL_BY_TYPE };
