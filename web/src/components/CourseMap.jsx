import CourseDiagram from "./CourseDiagram";
import { MARKER_TYPES } from "../lib/obstacleCourse";

const META_BY_TYPE = Object.fromEntries(MARKER_TYPES.map((m) => [m.key, m]));
const DIST_OPTIONS = MARKER_TYPES.filter((m) => m.key.startsWith("dist"));

/**
 * The GFD obstacle-course diagram with penalty markers dropped on it. Tapping the image
 * (when `onTap` is given) reports the tap position as fractions of the image's width/height
 * so markers stay put across any screen size. Tapping a marker (when `onMarkerClick` is
 * given) reports its index — the runner uses that to remove it. With neither handler it's a
 * read-only picture, reused on the Results/report sheet so the record shows exactly where
 * each penalty happened.
 *
 * `distanceSlots`, when given, renders a small "Distance?" dropdown fixed at each stopping-
 * distance measurement spot instead of a free-tap pin there — picking a tier grades it
 * automatically. Markers already sitting at one of those exact positions are hidden from
 * the pin layer so they aren't drawn twice.
 */
export default function CourseMap({ markers = [], onTap, onMarkerClick, distanceSlots }) {
  function handleTap(e) {
    if (!onTap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onTap({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }

  const slotPositions = new Set((distanceSlots ?? []).map((s) => `${s.x}|${s.y}`));

  return (
    <div
      onClick={handleTap}
      style={{
        position: "relative",
        width: "100%",
        lineHeight: 0,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        // Overlays (distance dropdowns) must never be invisibly clipped, so the rounded-
        // corner crop lives on the diagram wrapper below instead of on this container.
        overflow: "visible",
        cursor: onTap ? "crosshair" : "default",
        touchAction: "manipulation",
      }}
    >
      <div style={{ borderRadius: "var(--radius)", overflow: "hidden", lineHeight: 0, background: "#fff" }}>
        <CourseDiagram />
      </div>
      {distanceSlots?.map((slot) => (
        <div
          key={slot.key}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: `${slot.x * 100}%`,
            top: `${slot.y * 100}%`,
            transform: "translate(-50%, -50%)",
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "3px 4px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            // Width scales with the diagram, not a fixed pixel size — obstacle 2 and 5's
            // stops are only ~15% of the width apart, so fixed-width boxes overlap on a
            // narrow (portrait) screen. A percentage keeps them clear of each other in
            // both orientations, wide in landscape (the intended orientation) and merely
            // compact in portrait.
            width: "14%",
            minWidth: 46,
            maxWidth: 110,
            boxSizing: "border-box",
            // This container inherits `lineHeight: 0` from the outer wrapper above (needed
            // there to avoid a gap under the SVG); without resetting it here, the label
            // text's line box collapses to zero height and its glyphs render overflowing
            // past the box's own border instead of sitting inside it.
            lineHeight: "normal",
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text)", marginBottom: 2, lineHeight: "normal" }}>
            Distance?
          </div>
          <select
            value={slot.value ?? ""}
            disabled={!slot.onChange}
            onChange={(e) => slot.onChange?.(e.target.value)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 4,
              textOverflow: "ellipsis",
              lineHeight: "normal",
            }}
          >
            <option value="" disabled hidden>— Select —</option>
            {DIST_OPTIONS.map((mt) => (
              <option key={mt.key} value={mt.key}>
                {mt.label}
                {mt.key === "distDNF" ? "" : mt.points ? ` (−${mt.points})` : " (no penalty)"}
              </option>
            ))}
          </select>
        </div>
      ))}
      {markers.map((m, i) => {
        if (m.x == null || m.y == null) return null;
        if (slotPositions.has(`${m.x}|${m.y}`)) return null;
        const meta = META_BY_TYPE[m.type];
        return (
          <button
            key={i}
            type="button"
            title={meta?.label}
            onClick={(e) => {
              e.stopPropagation();
              onMarkerClick?.(i);
            }}
            style={{
              position: "absolute",
              left: `${m.x * 100}%`,
              top: `${m.y * 100}%`,
              transform: "translate(-50%, -50%)",
              width: 24,
              height: 24,
              padding: 0,
              borderRadius: "50%",
              background: meta?.color ?? "#333",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: "20px",
              border: "2px solid #fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
              cursor: onMarkerClick ? "pointer" : "default",
            }}
          >
            {meta?.short ?? "•"}
          </button>
        );
      })}
    </div>
  );
}
