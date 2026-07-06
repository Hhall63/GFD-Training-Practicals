import { computeObstacleCourseScore, formatClock } from "../lib/obstacleCourse";

/** Read-only per-obstacle breakdown, reused on the Results screen and in historical
 * session detail so both places show the identical "test sheet" the evaluator produced. */
export default function ObstacleCourseSummary({ config, tallies }) {
  if (!config || !tallies) return null;
  const scoring = computeObstacleCourseScore(config, tallies);

  return (
    <div style={{ marginTop: 8 }}>
      <div className="muted">Total time: {formatClock(tallies.totalSeconds)} (base {scoring.baseScore} pts)</div>
      {config.obstacles.map((obstacle, i) => {
        const t = tallies.obstacles?.[i] ?? {};
        const parts = [];
        if (obstacle.penalties?.cones) parts.push(`${t.cones ?? 0} cone(s)`);
        if (obstacle.penalties?.lineCrossings) parts.push(`${t.lineCrossings ?? 0} line crossing(s)`);
        if (obstacle.penalties?.stopLine) parts.push(t.stopLine ? "stop line missed" : "stop line ok");
        if (obstacle.penalties?.stoppingDistance) parts.push(`stopping distance tier ${t.stoppingDistanceTier ?? 0}`);
        if (parts.length === 0) return null;
        return (
          <div key={i} className="muted" style={{ fontSize: 13 }}>
            {obstacle.label}: {parts.join(", ")}
          </div>
        );
      })}
      <div className="muted">Deductions: −{scoring.deductions} → Score: {scoring.score}/100</div>
      {scoring.autoFailCones && (
        <div style={{ color: "var(--brand-red)", fontWeight: 600, fontSize: 13 }}>
          AUTOMATIC FAILURE: {scoring.totalCones} cone penalties (max {config.maxConePenalties})
        </div>
      )}
      {scoring.autoFailTime && (
        <div style={{ color: "var(--brand-red)", fontWeight: 600, fontSize: 13 }}>
          AUTOMATIC FAILURE: total time {formatClock(tallies.totalSeconds)} ≥ {formatClock(config.maxTotalSeconds)}
        </div>
      )}
    </div>
  );
}
