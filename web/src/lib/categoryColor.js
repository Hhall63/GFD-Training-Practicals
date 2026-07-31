// Deterministic category → tag color, so the same category (e.g. "Hose Operations")
// always renders as the same tag color everywhere it appears (browse list, working set),
// without maintaining a hand-authored category → color map for banks that name their own
// categories freely. 8 desaturated hues keep this Restrained per PRODUCT.md — a scanning
// aid, not decoration — and stay legible against --surface at normal text weight.
const TAG_COLOR_COUNT = 8;

export function categoryTagClass(category) {
  const index = hashString(category ?? "") % TAG_COLOR_COUNT;
  return `category-tag category-tag--${index}`;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
