import { useEffect, useRef, useState } from "react";
import { RESULT } from "../lib/constants";
import CourseMap from "./CourseMap";
import {
  computeObstacleCourseScore,
  defaultObstacleCourseConfig,
  formatClock,
  MARKER_TYPES,
  seedObstacleTallies,
} from "../lib/obstacleCourse";

/**
 * Live dashboard for the driving/EVD obstacle course. One continuous stopwatch for the
 * whole drive, plus the actual course diagram: the evaluator picks a penalty type and taps
 * the map where it happened (a cone hit, a line crossing, a stop-line hit, a stopping-
 * distance measurement). Taps become scored markers; tapping a marker removes it. Every
 * change recomputes the score through computeObstacleCourseScore — the same function
 * results/reporting/CSV use — so there is one source of truth for the math.
 */
export default function ObstacleCourseRunner({ current, patchCurrent }) {
  // The course is a fixed department form; fall back to the baked-in config so a missing
  // snapshot can never blank the screen.
  const config = current.obstacleCourseConfigSnapshot ?? defaultObstacleCourseConfig();
  const [tallies, setTallies] = useState(current.obstacleTallies ?? seedObstacleTallies());
  const [mode, setMode] = useState("cone");
  const [isRunning, setIsRunning] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const startRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const markers = tallies.markers ?? [];
  const displaySeconds = isRunning ? liveElapsed : tallies.totalSeconds ?? 0;
  const scoring = computeObstacleCourseScore(config, { ...tallies, totalSeconds: displaySeconds });
  const started = tallies.totalSeconds != null || isRunning;

  async function commit(next) {
    const hasTime = next.totalSeconds != null;
    const finalScoring = computeObstacleCourseScore(config, next);
    setTallies(next);
    await patchCurrent({
      obstacleTallies: next,
      timerElapsedSeconds: next.totalSeconds ?? null,
      pointsEarned: hasTime ? finalScoring.score : null,
      // The step is critical: only an automatic-failure trigger sets a FAIL result. A low
      // (but non-auto-fail) score still passes the step and just lowers the test total.
      result: hasTime ? (finalScoring.autoFail ? RESULT.FAIL : RESULT.PASS) : null,
    });
  }

  function start() {
    startRef.current = Date.now();
    setLiveElapsed(0);
    setIsRunning(true);
    intervalRef.current = setInterval(() => setLiveElapsed((Date.now() - startRef.current) / 1000), 100);
  }

  function stop() {
    clearInterval(intervalRef.current);
    setIsRunning(false);
    const finalSeconds = (Date.now() - startRef.current) / 1000;
    commit({ ...tallies, totalSeconds: finalSeconds });
  }

  function addMarker(pos) {
    commit({ ...tallies, markers: [...markers, { x: pos.x, y: pos.y, type: mode }] });
  }

  function removeMarker(index) {
    commit({ ...tallies, markers: markers.filter((_, i) => i !== index) });
  }

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          margin: "4px 0",
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
        <div
          className={`badge ${scoring.autoFail ? "fail" : "pass"}`}
          style={{ fontSize: 16, marginBottom: 12, display: "block", textAlign: "center" }}
        >
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
          Base {scoring.baseScore} − {scoring.deductions} deductions · {scoring.markerCount} penalt{scoring.markerCount === 1 ? "y" : "ies"}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, margin: "0 0 8px", textAlign: "left" }}>
        Pick a penalty, then tap the course where it happened. Tap a marker to remove it.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {MARKER_TYPES.map((mt) => (
          <button
            key={mt.key}
            type="button"
            onClick={() => setMode(mt.key)}
            style={{
              padding: "6px 10px",
              fontSize: 13,
              borderRadius: 8,
              border: `1px solid ${mode === mt.key ? mt.color : "var(--border)"}`,
              background: mode === mt.key ? mt.color : "white",
              color: mode === mt.key ? "white" : "var(--text)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: mt.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "16px",
                textAlign: "center",
              }}
            >
              {mt.short}
            </span>
            {mt.label} −{mt.points}
          </button>
        ))}
      </div>

      <CourseMap markers={markers} onTap={addMarker} onMarkerClick={removeMarker} />
    </div>
  );
}
