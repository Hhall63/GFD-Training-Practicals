/**
 * Pure scoring logic for the "Obstacle Course" line type (a continuous driving/EVD
 * evaluation scored by tiered time + per-obstacle penalty deductions, with two
 * independent automatic-failure triggers). Kept in one file so the builder config UI,
 * the live runner, the results/report summaries, and the CSV export all compute the
 * same numbers off the same math — nothing re-derives the score independently.
 *
 * Config shape (stored on the template line as `obstacleCourseConfig`, and snapshotted
 * onto the session's lineResult as `obstacleCourseConfigSnapshot` at test-start):
 *   {
 *     obstacles: [{ label, penalties: { cones, lineCrossings, stopLine, stoppingDistance } }],
 *     conePenaltyPoints, lineCrossingPenaltyPoints, stopLinePenaltyPoints,
 *     stoppingDistancePenaltyTiers: [tier1Points, tier2Points, tier3Points],
 *     timeTiers: [{ maxSeconds, points }, ...] (last tier's maxSeconds is null = no ceiling),
 *     maxConePenalties, maxTotalSeconds,
 *   }
 *
 * Tallies shape (the evaluator's live/raw entries, stored on the lineResult as
 * `obstacleTallies`):
 *   {
 *     totalSeconds,
 *     obstacles: [{ cones, lineCrossings, stopLine, stoppingDistanceTier }],
 *   }
 */

export function defaultObstacleCourseConfig() {
  return {
    obstacles: [
      { label: "Obstacle 1", penalties: { cones: true, lineCrossings: true, stopLine: false, stoppingDistance: false } },
      { label: "Obstacle 2", penalties: { cones: true, lineCrossings: true, stopLine: true, stoppingDistance: false } },
      { label: "Obstacle 3", penalties: { cones: true, lineCrossings: true, stopLine: false, stoppingDistance: false } },
      { label: "Obstacle 4", penalties: { cones: true, lineCrossings: true, stopLine: false, stoppingDistance: false } },
      { label: "Obstacle 5", penalties: { cones: true, lineCrossings: true, stopLine: false, stoppingDistance: true } },
    ],
    conePenaltyPoints: 4,
    lineCrossingPenaltyPoints: 2,
    stopLinePenaltyPoints: 10,
    stoppingDistancePenaltyTiers: [2, 4, 6],
    timeTiers: [
      { maxSeconds: 210, points: 100 }, // < 3:30
      { maxSeconds: 225, points: 96 }, // 3:30–3:44
      { maxSeconds: 240, points: 92 }, // 3:45–3:59
      { maxSeconds: 255, points: 88 }, // 4:00–4:14
      { maxSeconds: 270, points: 84 }, // 4:15–4:29
      { maxSeconds: null, points: 80 }, // 4:30+
    ],
    maxConePenalties: 6,
    maxTotalSeconds: 390, // 6:30
  };
}

export function seedObstacleTallies(config) {
  return {
    totalSeconds: null,
    obstacles: (config?.obstacles ?? []).map(() => ({
      cones: 0,
      lineCrossings: 0,
      stopLine: false,
      stoppingDistanceTier: 0,
    })),
  };
}

function scoreForTime(timeTiers, totalSeconds) {
  for (const tier of timeTiers ?? []) {
    if (tier.maxSeconds == null || totalSeconds <= tier.maxSeconds) return tier.points;
  }
  return 0;
}

/** Single source of truth for turning raw tallies into a final 0–100 score plus the two
 * automatic-failure flags. Used by the live runner (to show a projected score as the
 * evaluator taps), and by results/reporting/CSV (to render the same numbers back out). */
export function computeObstacleCourseScore(config, tallies) {
  const totalSeconds = tallies?.totalSeconds ?? 0;
  const baseScore = scoreForTime(config?.timeTiers, totalSeconds);

  let deductions = 0;
  let totalCones = 0;
  let totalLineCrossings = 0;
  for (const obstacle of tallies?.obstacles ?? []) {
    totalCones += obstacle.cones ?? 0;
    totalLineCrossings += obstacle.lineCrossings ?? 0;
    deductions += (obstacle.cones ?? 0) * (config?.conePenaltyPoints ?? 0);
    deductions += (obstacle.lineCrossings ?? 0) * (config?.lineCrossingPenaltyPoints ?? 0);
    if (obstacle.stopLine) deductions += config?.stopLinePenaltyPoints ?? 0;
    if (obstacle.stoppingDistanceTier > 0) {
      deductions += config?.stoppingDistancePenaltyTiers?.[obstacle.stoppingDistanceTier - 1] ?? 0;
    }
  }

  const autoFailCones = totalCones >= (config?.maxConePenalties ?? Infinity);
  const autoFailTime = totalSeconds >= (config?.maxTotalSeconds ?? Infinity);
  const score = Math.max(0, Math.round(baseScore - deductions));

  return {
    baseScore,
    deductions,
    totalCones,
    totalLineCrossings,
    autoFailCones,
    autoFailTime,
    autoFail: autoFailCones || autoFailTime,
    score,
  };
}

export function formatClock(seconds) {
  const s = Math.max(0, seconds ?? 0);
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${rem}`;
}

/** Multi-line, human-readable breakdown used in the failure-notification email's full
 * test sheet — one line per obstacle plus the deduction/auto-fail summary. */
export function summarizeObstacleCourseLines(config, tallies) {
  const scoring = computeObstacleCourseScore(config, tallies);
  const lines = [];
  lines.push(`Total time: ${formatClock(tallies?.totalSeconds)} (base score ${scoring.baseScore})`);

  (config?.obstacles ?? []).forEach((obstacle, i) => {
    const t = tallies?.obstacles?.[i] ?? {};
    const parts = [];
    if (obstacle.penalties?.cones) parts.push(`${t.cones ?? 0} cone(s)`);
    if (obstacle.penalties?.lineCrossings) parts.push(`${t.lineCrossings ?? 0} line crossing(s)`);
    if (obstacle.penalties?.stopLine) parts.push(t.stopLine ? "stop line missed" : "stop line ok");
    if (obstacle.penalties?.stoppingDistance) parts.push(`stopping distance tier ${t.stoppingDistanceTier ?? 0}`);
    if (parts.length > 0) lines.push(`${obstacle.label}: ${parts.join(", ")}`);
  });

  lines.push(`Deductions: -${scoring.deductions} -> Final score: ${scoring.score}/100`);
  if (scoring.autoFailCones) {
    lines.push(`AUTOMATIC FAILURE: ${scoring.totalCones} cone penalties (max ${config.maxConePenalties})`);
  }
  if (scoring.autoFailTime) {
    lines.push(`AUTOMATIC FAILURE: total time ${formatClock(tallies?.totalSeconds)} exceeded ${formatClock(config.maxTotalSeconds)}`);
  }
  return lines;
}

/** One-line summary for the CSV export's additive trailing column. */
export function summarizeObstacleCourseOneLine(config, tallies) {
  const scoring = computeObstacleCourseScore(config, tallies);
  return `time ${formatClock(tallies?.totalSeconds)}, ${scoring.totalCones} cones, ${scoring.totalLineCrossings} line crossings, score ${scoring.score}/100${scoring.autoFail ? " (AUTO-FAIL)" : ""}`;
}
