import { useEffect, useRef, useState } from "react";
import { RESULT } from "../lib/constants";
import CourseMap from "./CourseMap";
import {
  computeObstacleCourseScore,
  defaultObstacleCourseConfig,
  DISTANCE_SLOTS,
  formatClock,
  seedObstacleTallies,
  TAP_MARKER_TYPES,
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
  const [isPaused, setIsPaused] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  // Set by Stop when obstacle 5's distance hasn't been picked yet — holds the clock's final
  // time until that's filled in, instead of finalizing the score without it.
  const [pendingSeconds, setPendingSeconds] = useState(null);
  const [showDistanceWarning, setShowDistanceWarning] = useState(false);
  const [portrait, setPortrait] = useState(
    typeof window !== "undefined" ? window.matchMedia("(orientation: portrait)").matches : true
  );
  const startRef = useRef(null); // Date.now() when the current running segment began
  const accumulatedRef = useRef(0); // seconds banked from prior run segments (pause/resume)
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = (e) => setPortrait(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const markers = tallies.markers ?? [];
  const displaySeconds = isRunning || isPaused || pendingSeconds != null ? liveElapsed : tallies.totalSeconds ?? 0;
  const scoring = computeObstacleCourseScore(config, { ...tallies, totalSeconds: displaySeconds });
  const started = tallies.totalSeconds != null || isRunning || isPaused || pendingSeconds != null;
  const obstacle5Slot = DISTANCE_SLOTS[1];
  const hasObstacle5Distance = markers.some((m) => m.x === obstacle5Slot.x && m.y === obstacle5Slot.y);

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

  function tick() {
    setLiveElapsed(accumulatedRef.current + (Date.now() - startRef.current) / 1000);
  }

  function start() {
    accumulatedRef.current = 0;
    startRef.current = Date.now();
    setLiveElapsed(0);
    setPendingSeconds(null);
    setShowDistanceWarning(false);
    setIsRunning(true);
    setIsPaused(false);
    intervalRef.current = setInterval(tick, 100);
  }

  function pause() {
    clearInterval(intervalRef.current);
    accumulatedRef.current += (Date.now() - startRef.current) / 1000;
    setLiveElapsed(accumulatedRef.current);
    setIsRunning(false);
    setIsPaused(true);
  }

  function resume() {
    startRef.current = Date.now();
    setIsRunning(true);
    setIsPaused(false);
    intervalRef.current = setInterval(tick, 100);
  }

  function stop() {
    clearInterval(intervalRef.current);
    const finalSeconds = isRunning ? accumulatedRef.current + (Date.now() - startRef.current) / 1000 : accumulatedRef.current;
    setIsRunning(false);
    setIsPaused(false);
    if (!hasObstacle5Distance) {
      // Hold the clock at its final time and withhold scoring until the missing distance is
      // picked — canAdvance() in the runner page already blocks Finish while result is null,
      // so this naturally keeps the evaluator from moving on with an incomplete score.
      setLiveElapsed(finalSeconds);
      setPendingSeconds(finalSeconds);
      setShowDistanceWarning(true);
      return;
    }
    commit({ ...tallies, totalSeconds: finalSeconds });
  }

  function addMarker(pos) {
    commit({ ...tallies, markers: [...markers, { x: pos.x, y: pos.y, type: mode }] });
  }

  function removeMarker(index) {
    commit({ ...tallies, markers: markers.filter((_, i) => i !== index) });
  }

  function setDistance(slot, value) {
    const others = markers.filter((m) => !(m.x === slot.x && m.y === slot.y));
    const next = value ? [...others, { x: slot.x, y: slot.y, type: value }] : others;
    const isObstacle5Slot = slot.x === obstacle5Slot.x && slot.y === obstacle5Slot.y;
    if (pendingSeconds != null && isObstacle5Slot && value) {
      // The missing piece Stop was waiting on just got filled in — finalize now.
      commit({ ...tallies, markers: next, totalSeconds: pendingSeconds });
      setPendingSeconds(null);
      setShowDistanceWarning(false);
    } else {
      commit({ ...tallies, markers: next });
    }
  }

  const distanceSlots = DISTANCE_SLOTS.map((slot) => ({
    ...slot,
    value: markers.find((m) => m.x === slot.x && m.y === slot.y)?.type ?? "",
    onChange: (value) => setDistance(slot, value),
  }));

  return (
    <div style={{ width: "100%", maxWidth: 720 }}>
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

      <div style={{ textAlign: "center", marginBottom: 12, display: "flex", gap: 10, justifyContent: "center" }}>
        {isRunning ? (
          <>
            <button className="secondary" style={{ maxWidth: 160 }} onClick={pause}>
              Pause
            </button>
            <button className="primary danger" style={{ maxWidth: 160 }} onClick={stop}>
              Stop
            </button>
          </>
        ) : isPaused ? (
          <>
            <button className="primary" style={{ maxWidth: 160 }} onClick={resume}>
              Resume
            </button>
            <button className="primary danger" style={{ maxWidth: 160 }} onClick={stop}>
              Stop
            </button>
          </>
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
      </div>

      <p className="muted" style={{ fontSize: 13, margin: "0 0 8px", textAlign: "left" }}>
        Pick a penalty, then tap the course where it happened. Tap a marker to remove it.
        Stopping distances are graded from the dropdowns on the map.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {TAP_MARKER_TYPES.map((mt) => (
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

      {portrait && (
        <div
          style={{
            background: "var(--brand-navy)",
            color: "#fff",
            fontWeight: 600,
            fontSize: 13,
            padding: "8px 10px",
            borderRadius: 8,
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          ↻ Turn your device sideways (landscape) for a bigger course.
        </div>
      )}

      <CourseMap markers={markers} onTap={addMarker} onMarkerClick={removeMarker} distanceSlots={distanceSlots} />

      {showDistanceWarning && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div className="card" style={{ maxWidth: 320, padding: 24, textAlign: "center" }}>
            <h3 style={{ marginBottom: 12 }}>Distance Needed</h3>
            <p className="muted" style={{ marginBottom: 20 }}>
              Select a stopping distance for Obstacle 5 on the map before the score can be
              finalized.
            </p>
            <button className="primary" onClick={() => setShowDistanceWarning(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
