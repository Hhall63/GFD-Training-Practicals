import { useEffect, useRef, useState } from "react";
import { RESULT } from "../lib/constants";
import { computeObstacleCourseScore, formatClock, seedObstacleTallies } from "../lib/obstacleCourse";

/**
 * The live dashboard for a single continuous drive: one stopwatch for the whole course,
 * plus all enabled obstacles' penalty tallies visible and editable at once (not
 * one-at-a-time), matching how an evaluator actually rides along and marks penalties as
 * they happen. Every change recomputes the score through computeObstacleCourseScore, the
 * same function results/reporting/CSV use, so there's one source of truth for the math.
 */
export default function ObstacleCourseRunner({ current, patchCurrent }) {
  const config = current.obstacleCourseConfigSnapshot;
  const [tallies, setTallies] = useState(current.obstacleTallies ?? seedObstacleTallies(config));
  const [isRunning, setIsRunning] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const startRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const displaySeconds = isRunning ? liveElapsed : tallies.totalSeconds ?? 0;
  const scoring = computeObstacleCourseScore(config, { ...tallies, totalSeconds: displaySeconds });

  function start() {
    startRef.current = Date.now();
    setLiveElapsed(0);
    setIsRunning(true);
    intervalRef.current = setInterval(() => setLiveElapsed((Date.now() - startRef.current) / 1000), 100);
  }

  async function stop() {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    const finalSeconds = (Date.now() - startRef.current) / 1000;
    const nextTallies = { ...tallies, totalSeconds: finalSeconds };
    setTallies(nextTallies);
    await commit(nextTallies);
  }

  async function commit(nextTallies) {
    const finalScoring = computeObstacleCourseScore(config, nextTallies);
    await patchCurrent({
      obstacleTallies: nextTallies,
      timerElapsedSeconds: nextTallies.totalSeconds,
      pointsEarned: finalScoring.score,
      result: finalScoring.autoFail ? RESULT.FAIL : RESULT.PASS,
    });
  }

  function updateObstacle(index, patch) {
    const obstacles = tallies.obstacles.map((o, i) => (i === index ? { ...o, ...patch } : o));
    const next = { ...tallies, obstacles };
    setTallies(next);
    if (next.totalSeconds != null) commit(next);
  }

  const started = tallies.totalSeconds != null || isRunning;

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          margin: "8px 0",
        }}
      >
        {formatClock(displaySeconds)}
      </div>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        {isRunning ? (
          <button className="primary danger" style={{ maxWidth: 320 }} onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="primary" style={{ maxWidth: 320 }} onClick={start}>
            {started ? "Restart" : "Start"}
          </button>
        )}
      </div>

      {!isRunning && tallies.totalSeconds != null && (
        <div className={`badge ${scoring.autoFail ? "fail" : "pass"}`} style={{ fontSize: 16, marginBottom: 12, display: "block", textAlign: "center" }}>
          {scoring.autoFail ? "FAIL" : "PASS"}
        </div>
      )}

      {(scoring.autoFailCones || scoring.autoFailTime) && (
        <div
          style={{
            background: "rgba(196,33,47,0.1)",
            color: "var(--brand-red)",
            fontWeight: 600,
            fontSize: 13,
            padding: "8px 10px",
            borderRadius: 8,
            marginBottom: 12,
          }}
        >
          {scoring.autoFailCones && <div>AUTOMATIC FAILURE: {scoring.totalCones} cone penalties (max {config.maxConePenalties})</div>}
          {scoring.autoFailTime && <div>AUTOMATIC FAILURE: time exceeds {formatClock(config.maxTotalSeconds)}</div>}
        </div>
      )}

      <div className="card" style={{ textAlign: "left", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
          <span>Projected Score</span>
          <span>{scoring.score} / 100</span>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          Base {scoring.baseScore} − {scoring.deductions} deductions
        </div>
      </div>

      {config.obstacles.map((obstacle, i) => (
        <ObstacleRow
          key={i}
          obstacle={obstacle}
          tally={tallies.obstacles[i]}
          onChange={(patch) => updateObstacle(i, patch)}
        />
      ))}
    </div>
  );
}

function ObstacleRow({ obstacle, tally, onChange }) {
  return (
    <div className="card" style={{ textAlign: "left", marginBottom: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{obstacle.label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {obstacle.penalties.cones && (
          <Counter label="Cones" value={tally.cones} onChange={(v) => onChange({ cones: v })} />
        )}
        {obstacle.penalties.lineCrossings && (
          <Counter label="Line Crossings" value={tally.lineCrossings} onChange={(v) => onChange({ lineCrossings: v })} />
        )}
        {obstacle.penalties.stopLine && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={Boolean(tally.stopLine)}
              onChange={(e) => onChange({ stopLine: e.target.checked })}
              style={{ width: "auto", margin: 0 }}
            />
            Stop Line Missed
          </label>
        )}
        {obstacle.penalties.stoppingDistance && (
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
            Stopping Distance
            <select
              value={tally.stoppingDistanceTier ?? 0}
              onChange={(e) => onChange({ stoppingDistanceTier: Number(e.target.value) })}
              style={{ width: 130 }}
            >
              <option value={0}>None</option>
              <option value={1}>Tier 1</option>
              <option value={2}>Tier 2</option>
              <option value={3}>Tier 3</option>
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

function Counter({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
      {label}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="secondary"
          style={{ width: 32, height: 32, padding: 0 }}
          onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
        >
          −
        </button>
        <span style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>{value ?? 0}</span>
        <button
          type="button"
          className="secondary"
          style={{ width: 32, height: 32, padding: 0 }}
          onClick={() => onChange((value ?? 0) + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
