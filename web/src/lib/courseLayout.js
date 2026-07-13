/**
 * Pure geometry for the GFD SRFF obstacle course diagram — shared between the interactive
 * SVG (`CourseDiagram.jsx`) and the flat raster snapshot emailed on a failure
 * (`courseImage.js`), so the two can never visually drift apart. viewBox is 1200 x 692.
 */

export const VIEWBOX = { width: 1200, height: 692 };
export const BLOCK_SIZE = 24; // cone block size, in viewBox units
export const COLORS = { block: "#94a3b8", guide: "#cbd5e1", ink: "#0f172a" };

function col(x, y0, y1, n) {
  return Array.from({ length: n }, (_, i) => ({ x, y: y0 + ((y1 - y0) * i) / (n - 1) }));
}
function row(y, x0, x1, n) {
  return Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y }));
}

// Cone blocks, per obstacle (positions traced from the department form).
export const CONES = [
  // 5 — left straight alley + penalty stop
  ...col(300, 42, 457, 9), ...col(372, 42, 457, 9), ...row(498, 300, 372, 3),
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
  ...col(924, 124, 443, 4),
];

// Faint guide lines behind the cones, so the lanes read as lanes.
export const GUIDES = [
  [300, 42, 300, 457], [372, 42, 372, 457], // 5
  [456, 42, 456, 540], [528, 42, 528, 540], [456, 42, 528, 42], // 1
  [120, 408, 192, 408], [120, 408, 120, 498], [192, 408, 192, 498], // 2
  [588, 97, 588, 201], [648, 97, 648, 201], [684, 298, 684, 401], [756, 298, 756, 401], // 4
  [804, 76, 804, 498], [1056, 76, 1056, 498], // 3 sides
  [804, 76, 876, 76], [948, 76, 1056, 76], [804, 498, 876, 498], [948, 498, 1056, 498], // 3 top/bottom
  [924, 124, 924, 443], // 3 center
];

export const LABELS = [
  { t: "1", x: 570, y: 300 }, { t: "2", x: 230, y: 450 }, { t: "3", x: 930, y: 590 },
  { t: "4", x: 664, y: 250 }, { t: "5", x: 420, y: 250 },
];

export const ARROWS = [
  { x: 618, yTail: 214, yHead: 80 },
  { x: 720, yTail: 415, yHead: 281 },
];
