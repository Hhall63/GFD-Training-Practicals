import CourseMap from "./CourseMap";
import {
  computeObstacleCourseScore,
  countMarkersByType,
  defaultObstacleCourseConfig,
  formatClock,
  MARKER_TYPES,
} from "../lib/obstacleCourse";

/** Read-only obstacle-course "test sheet", reused on the Results screen and in historical
 * session detail: the course diagram with the exact penalty markers the evaluator placed,
 * plus the time/deduction/score breakdown. */
export default function ObstacleCourseSummary({ config, tallies }) {
  if (!tallies) return null;
  const cfg = config ?? defaultObstacleCourseConfig();
  const scoring = computeObstacleCourseScore(cfg, tallies);
  const counts = countMarkersByType(tallies);
  const markers = tallies.markers ?? [];

  return (
    <div style={{ marginTop: 8 }}>
      {markers.some((m) => m.x != null) && (
        <div style={{ maxWidth: 480, marginBottom: 8 }}>
          <CourseMap markers={markers} />
        </div>
      )}
      <div className="muted">Total time: {formatClock(tallies.totalSeconds)} (base {scoring.baseScore} pts)</div>
      {MARKER_TYPES.map((mt) =>
        counts[mt.key] ? (
          <div key={mt.key} className="muted" style={{ fontSize: 13 }}>
            {mt.label}: {counts[mt.key]} (−{counts[mt.key] * mt.points})
          </div>
        ) : null
      )}
      <div className="muted">Deductions: −{scoring.deductions} → Score: {scoring.score}/100</div>
      {scoring.autoFailCones && (
        <div style={{ color: "var(--brand-red)", fontWeight: 600, fontSize: 13 }}>
          AUTOMATIC FAILURE: {scoring.totalCones} cone penalties (max {cfg.maxConePenalties})
        </div>
      )}
      {scoring.autoFailTime && (
        <div style={{ color: "var(--brand-red)", fontWeight: 600, fontSize: 13 }}>
          AUTOMATIC FAILURE: total time {formatClock(tallies.totalSeconds)} ≥ {formatClock(cfg.maxTotalSeconds)}
        </div>
      )}
    </div>
  );
}
