import { ARROWS, BLOCK_SIZE, COLORS, CONES, GUIDES, LABELS, VIEWBOX } from "./courseLayout";
import { MARKER_TYPES } from "./obstacleCourse";

const META_BY_TYPE = Object.fromEntries(MARKER_TYPES.map((m) => [m.key, m]));

/**
 * Renders the graded course — the diagram plus every penalty/distance marker the evaluator
 * actually placed — as a flat PNG data URL, for attaching a permanent visual "test sheet" to
 * the failure-notification email (the live map's interactive dropdowns/tap targets don't mean
 * anything in an email). Pure canvas drawing sharing geometry with `CourseDiagram.jsx` via
 * `courseLayout.js`, so the emailed snapshot always matches what the evaluator saw on screen.
 * Mostly flat white background with sparse shapes/text, so PNG compresses very small.
 */
export function renderGradedCourseImage(markers, { scale = 1.5 } = {}) {
  const width = VIEWBOX.width * scale;
  const height = VIEWBOX.height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = COLORS.guide;
  ctx.lineWidth = 2 * scale;
  for (const [x1, y1, x2, y2] of GUIDES) {
    ctx.beginPath();
    ctx.moveTo(x1 * scale, y1 * scale);
    ctx.lineTo(x2 * scale, y2 * scale);
    ctx.stroke();
  }

  ctx.fillStyle = COLORS.block;
  const half = (BLOCK_SIZE * scale) / 2;
  for (const c of CONES) {
    ctx.fillRect(c.x * scale - half, c.y * scale - half, BLOCK_SIZE * scale, BLOCK_SIZE * scale);
  }

  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = COLORS.ink;
  ctx.lineWidth = 3 * scale;
  for (const a of ARROWS) {
    ctx.beginPath();
    ctx.moveTo(a.x * scale, a.yTail * scale);
    ctx.lineTo(a.x * scale, (a.yHead + 6) * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.x * scale, a.yHead * scale);
    ctx.lineTo(a.x * scale - 8 * scale, (a.yHead + 14) * scale);
    ctx.lineTo(a.x * scale + 8 * scale, (a.yHead + 14) * scale);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 ${34 * scale}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of LABELS) {
    ctx.fillText(l.t, l.x * scale, l.y * scale);
  }

  // Penalty/distance markers actually placed by the evaluator — same colors/short codes as
  // the live map (CourseMap.jsx), positioned by the same x/y fractions of the image.
  const r = 13 * scale;
  ctx.font = `700 ${13 * scale}px sans-serif`;
  for (const m of markers ?? []) {
    if (m.x == null || m.y == null) continue;
    const meta = META_BY_TYPE[m.type];
    const cx = m.x * width;
    const cy = m.y * height;
    ctx.fillStyle = meta?.color ?? "#333";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(meta?.short ?? "•", cx, cy);
  }

  return canvas.toDataURL("image/png");
}
