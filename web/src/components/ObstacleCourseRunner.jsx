import { useEffect, useRef, useState } from "react";
import { RESULT } from "../lib/constants";
import { compressImageToDataUrl } from "../lib/image";
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
  const [portrait, setPortrait] = useState(
    typeof window !== "undefined" ? window.matchMedia("(orientation: portrait)").matches : true
  );
  const startRef = useRef(null); // Date.now() when the current running segment began
  const accumulatedRef = useRef(0); // seconds banked from prior run segments (pause/resume)
  const intervalRef = useRef(null);
  const [showAggressiveDrivingConfirm, setShowAggressiveDrivingConfirm] = useState(false);
  const [aggressiveDrivingNote, setAggressiveDrivingNote] = useState("");
  const [aggressiveDrivingPhotos, setAggressiveDrivingPhotos] = useState([]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const onChange = (e) => setPortrait(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const markers = tallies.markers ?? [];
  const hasAggressiveDriving = markers.some((m) => m.type === "aggressiveDriving");
  const displaySeconds = isRunning || isPaused ? liveElapsed : tallies.totalSeconds ?? 0;
  const scoring = computeObstacleCourseScore(config, { ...tallies, totalSeconds: displaySeconds });
  const started = tallies.totalSeconds != null || isRunning || isPaused;

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
    commit({ ...tallies, markers: next });
  }

  // Confirms the critical failure: folds a positionless aggressiveDriving marker into the
  // tally (so computeObstacleCourseScore's autoFail picks it up the same way it already does
  // for the two existing triggers) and appends the required note (plus any optional photos)
  // onto the line's own `note`/`photoURLs` fields — the same fields LiveTestRunnerPage's
  // fail-note gate and the failure email already read, so this shows up everywhere a normal
  // fail-note does with no extra wiring.
  async function confirmAggressiveDriving() {
    const trimmed = aggressiveDrivingNote.trim();
    if (!trimmed) return;
    await commit({ ...tallies, markers: [...markers, { type: "aggressiveDriving" }] });
    await patchCurrent({
      note: current.note ? `${current.note}\n\n${trimmed}` : trimmed,
      photoURLs: [...(current.photoURLs ?? []), ...aggressiveDrivingPhotos],
    });
    setAggressiveDrivingNote("");
    setAggressiveDrivingPhotos([]);
    setShowAggressiveDrivingConfirm(false);
  }

  async function handleAggressiveDrivingPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file);
    setAggressiveDrivingPhotos((prev) => [...prev, dataUrl]);
    e.target.value = "";
  }

  // Lets the evaluator undo a mis-tap. Recomputes result/autoFail through the normal commit()
  // path, so removing it correctly reverts the step to PASS when it was the only trigger (and
  // correctly leaves the step FAILed if the cone/time trigger is also active). Deliberately
  // does not touch current.note — notes are free-form concatenated text with no marker
  // linkage, so there's no reliable way to strip only the sentence this trigger appended.
  // The evaluator can edit the note by hand via the attachment panel if it's now stale.
  function removeAggressiveDriving() {
    commit({ ...tallies, markers: markers.filter((m) => m.type !== "aggressiveDriving") });
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
            <button className="primary warning" style={{ maxWidth: 160 }} onClick={pause}>
              Pause
            </button>
            <button className="primary danger" style={{ maxWidth: 160 }} onClick={stop}>
              Finish
            </button>
          </>
        ) : isPaused ? (
          <>
            <button className="primary success" style={{ maxWidth: 160 }} onClick={resume}>
              Resume
            </button>
            <button className="primary danger" style={{ maxWidth: 160 }} onClick={stop}>
              Finish
            </button>
          </>
        ) : (
          <button className="primary" style={{ maxWidth: 320 }} onClick={start}>
            {started ? "Restart" : "Start"}
          </button>
        )}
      </div>

      {/* The pass/fail verdict and the "AUTOMATIC FAILURE" warnings are intentionally not
          shown here — the evaluator shouldn't see the outcome until the test is submitted.
          The result is still computed and stored; it's just revealed on the Results screen.
          The Projected Score stays visible as a neutral running tally. */}

      <div className="card" style={{ textAlign: "left", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 13, color: "var(--text-secondary)" }}>
            Projected Score
          </span>
          <span style={{ color: "var(--brand-navy)" }}>{scoring.score} / 100</span>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13, margin: "0 0 8px", textAlign: "left" }}>
        Pick a penalty, then tap the course where it happened. Tap a marker to remove it.
        Stopping distances are graded from the dropdowns on the map.
      </p>

      {hasAggressiveDriving ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            background: "#1a1a1a",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            padding: "10px 12px",
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          <span>🚨 Aggressive Driving recorded — this recruit fails the course</span>
          <button
            type="button"
            className="secondary"
            style={{ width: "auto", padding: "4px 10px", flexShrink: 0 }}
            onClick={removeAggressiveDriving}
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary danger"
          style={{ width: "100%", marginBottom: 10 }}
          onClick={() => setShowAggressiveDrivingConfirm(true)}
        >
          🚨 Aggressive Driving — Critical Failure
        </button>
      )}

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

      {showAggressiveDrivingConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowAggressiveDrivingConfirm(false)}
        >
          <div className="card" style={{ maxWidth: 340, padding: 24, textAlign: "left" }}>
            <h3 style={{ marginBottom: 8 }}>Aggressive Driving — Critical Failure</h3>
            <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
              This immediately fails the recruit on this course, regardless of score. Add a
              note explaining what happened before confirming.
            </p>
            <textarea
              autoFocus
              rows={3}
              placeholder="What did the recruit do?"
              value={aggressiveDrivingNote}
              onChange={(e) => setAggressiveDrivingNote(e.target.value)}
              style={{ width: "100%" }}
            />
            <div className="field" style={{ marginTop: 10 }}>
              <label>Photo (optional)</label>
              {aggressiveDrivingPhotos.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, marginRight: 8 }}
                />
              ))}
              <input type="file" accept="image/*" capture="environment" onChange={handleAggressiveDrivingPhoto} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button
                className="secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setShowAggressiveDrivingConfirm(false);
                  setAggressiveDrivingNote("");
                  setAggressiveDrivingPhotos([]);
                }}
              >
                Cancel
              </button>
              <button
                className="primary danger"
                style={{ flex: 1 }}
                disabled={!aggressiveDrivingNote.trim()}
                onClick={confirmAggressiveDriving}
              >
                Confirm Critical Failure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
