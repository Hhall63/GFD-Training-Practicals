/**
 * Vector recreation of the GFD SRFF obstacle course — a clean "digital blocks" version of
 * the paper diagram, drawn as an SVG so it stays crisp at any size and taps land precisely.
 * Five obstacles: two straight cone alleys with penalty stops (1 and 5), a chicane with a
 * penalty box (2), an offset serpentine with direction arrows (4), and a large box with a
 * center line (3). Rendered behind the tap markers by CourseMap; it fills its container and
 * keeps its aspect ratio, so marker fractions map the same way the photo's did.
 */

const S = 24; // cone block size, in viewBox units (viewBox is 1200 x 692)
const BLOCK = "#94a3b8";
const GUIDE = "#cbd5e1";
const INK = "#0f172a";

function col(x, y0, y1, n) {
  return Array.from({ length: n }, (_, i) => ({ x, y: y0 + ((y1 - y0) * i) / (n - 1) }));
}
function row(y, x0, x1, n) {
  return Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y }));
}

// Cone blocks, per obstacle (positions traced from the department form).
const CONES = [
  // 5 — left straight alley + penalty stop
  ...col(300, 42, 457, 9), ...col(372, 42, 457, 9), ...row(498, 300, 396, 5),
  // 1 — long straight alley (top cap + two legs)
  ...row(42, 456, 528, 3), ...col(456, 90, 540, 10), ...col(528, 90, 540, 10),
  // 2 — chicane
  ...row(408, 120, 192, 3), ...col(120, 457, 498, 2), ...col(192, 457, 498, 2),
  // 4 — offset serpentine (two gates)
  ...col(588, 97, 201, 3), ...col(648, 97, 201, 3),
  ...col(684, 298, 401, 3), ...col(756, 298, 401, 3),
  // 3 — box with a center line
  ...col(804, 76, 498, 9), ...col(1056, 76, 498, 9),
  ...row(76, 804, 876, 3), ...row(76, 948, 1056, 4),
  ...row(498, 804, 876, 3), ...row(498, 948, 1056, 4),
  ...col(924, 124, 443, 5),
];

// Faint guide lines behind the cones, so the lanes read as lanes.
const GUIDES = [
  [300, 42, 300, 457], [372, 42, 372, 457], // 5
  [456, 42, 456, 540], [528, 42, 528, 540], [456, 42, 528, 42], // 1
  [120, 408, 192, 408], [120, 408, 120, 498], [192, 408, 192, 498], // 2
  [588, 97, 588, 201], [648, 97, 648, 201], [684, 298, 684, 401], [756, 298, 756, 401], // 4
  [804, 76, 804, 498], [1056, 76, 1056, 498], // 3 sides
  [804, 76, 876, 76], [948, 76, 1056, 76], [804, 498, 876, 498], [948, 498, 1056, 498], // 3 top/bottom
  [924, 124, 924, 443], // 3 center
];

const LABELS = [
  { t: "1", x: 570, y: 300 }, { t: "2", x: 230, y: 450 }, { t: "3", x: 930, y: 590 },
  { t: "4", x: 664, y: 250 }, { t: "5", x: 420, y: 250 },
];

function Arrow({ x, yTail, yHead }) {
  return (
    <g stroke={INK} strokeWidth={3} fill={INK}>
      <line x1={x} y1={yTail} x2={x} y2={yHead + 6} />
      <polygon points={`${x},${yHead} ${x - 8},${yHead + 14} ${x + 8},${yHead + 14}`} stroke="none" />
    </g>
  );
}

export default function CourseDiagram() {
  return (
    <svg viewBox="0 0 1200 692" width="100%" style={{ display: "block" }} role="img" aria-label="GFD obstacle course diagram">
      <rect x={0} y={0} width={1200} height={692} fill="#fff" />
      {GUIDES.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GUIDE} strokeWidth={2} />
      ))}
      {CONES.map((c, i) => (
        <rect key={i} x={c.x - S / 2} y={c.y - S / 2} width={S} height={S} rx={3} fill={BLOCK} />
      ))}
      <Arrow x={618} yTail={214} yHead={80} />
      <Arrow x={720} yTail={415} yHead={281} />
      {LABELS.map((l) => (
        <text key={l.t} x={l.x} y={l.y} textAnchor="middle" fontSize={34} fontWeight="700" fill={INK}>{l.t}</text>
      ))}
    </svg>
  );
}
