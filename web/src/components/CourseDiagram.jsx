import { ARROWS, BLOCK_SIZE, COLORS, CONES, GUIDES, LABELS, VIEWBOX } from "../lib/courseLayout";

/**
 * Vector recreation of the GFD SRFF obstacle course — a clean "digital blocks" version of
 * the paper diagram, drawn as an SVG so it stays crisp at any size and taps land precisely.
 * Five obstacles: two straight cone alleys with penalty stops (1 and 5), a chicane with a
 * penalty box (2), an offset serpentine with direction arrows (4), and a large box with a
 * center line (3). Rendered behind the tap markers by CourseMap; it fills its container and
 * keeps its aspect ratio, so marker fractions map the same way the photo's did.
 *
 * Geometry lives in `lib/courseLayout.js`, shared with the flat raster snapshot
 * (`lib/courseImage.js`) that gets attached to the failure-notification email.
 */

function Arrow({ x, yTail, yHead }) {
  return (
    <g stroke={COLORS.ink} strokeWidth={3} fill={COLORS.ink}>
      <line x1={x} y1={yTail} x2={x} y2={yHead + 6} />
      <polygon points={`${x},${yHead} ${x - 8},${yHead + 14} ${x + 8},${yHead + 14}`} stroke="none" />
    </g>
  );
}

export default function CourseDiagram() {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      width="100%"
      style={{ display: "block" }}
      role="img"
      aria-label="GFD obstacle course diagram"
    >
      <rect x={0} y={0} width={VIEWBOX.width} height={VIEWBOX.height} fill="#fff" />
      {GUIDES.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.guide} strokeWidth={2} />
      ))}
      {CONES.map((c, i) => (
        <rect key={i} x={c.x - BLOCK_SIZE / 2} y={c.y - BLOCK_SIZE / 2} width={BLOCK_SIZE} height={BLOCK_SIZE} rx={3} fill={COLORS.block} />
      ))}
      {ARROWS.map((a, i) => (
        <Arrow key={i} x={a.x} yTail={a.yTail} yHead={a.yHead} />
      ))}
      {LABELS.map((l) => (
        <text key={l.t} x={l.x} y={l.y} textAnchor="middle" fontSize={34} fontWeight="700" fill={COLORS.ink}>{l.t}</text>
      ))}
    </svg>
  );
}
