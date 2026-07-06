import courseImg from "../assets/obstacle-course.jpg";
import { MARKER_TYPES } from "../lib/obstacleCourse";

const META_BY_TYPE = Object.fromEntries(MARKER_TYPES.map((m) => [m.key, m]));

/**
 * The GFD obstacle-course diagram with penalty markers dropped on it. Tapping the image
 * (when `onTap` is given) reports the tap position as fractions of the image's width/height
 * so markers stay put across any screen size. Tapping a marker (when `onMarkerClick` is
 * given) reports its index — the runner uses that to remove it. With neither handler it's a
 * read-only picture, reused on the Results/report sheet so the record shows exactly where
 * each penalty happened.
 */
export default function CourseMap({ markers = [], onTap, onMarkerClick }) {
  function handleTap(e) {
    if (!onTap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onTap({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }

  return (
    <div
      onClick={handleTap}
      style={{
        position: "relative",
        width: "100%",
        lineHeight: 0,
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        cursor: onTap ? "crosshair" : "default",
        touchAction: "manipulation",
        background: "#fff",
      }}
    >
      <img src={courseImg} alt="GFD obstacle course diagram" style={{ width: "100%", display: "block" }} />
      {markers.map((m, i) => {
        if (m.x == null || m.y == null) return null;
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
