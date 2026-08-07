/** One restrained line-icon set for the whole app, so the "instrument panel" reads
 * consistently instead of switching between deliberate SVG glyphs (dashboard) and raw OS
 * emoji (live test runner) whose weight/color/legibility vary by platform. Originally local
 * to AdminDashboardPage.jsx; promoted here once the live-test-runner screens needed the
 * same glyph language. */
export default function Icon({ name, size = 24 }) {
  const stroke = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (name) {
    case "play":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      );
    case "pause":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      );
    case "stop":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      );
    case "recruits":
      return (
        <svg {...stroke}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "tests":
      return (
        <svg {...stroke}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <line x1="8" y1="11" x2="16" y2="11" />
          <line x1="8" y1="15" x2="13" y2="15" />
        </svg>
      );
    case "groups":
      return (
        <svg {...stroke}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case "batchGrade":
      return (
        <svg {...stroke}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 3h6v2a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V3z" />
          <path d="M9 13l2 2 4-4" />
        </svg>
      );
    case "reports":
      return (
        <svg {...stroke}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "addUser":
      return (
        <svg {...stroke}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      );
    case "users":
      return (
        <svg {...stroke}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "testBank":
      return (
        <svg {...stroke}>
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case "gradebook":
      return (
        <svg {...stroke}>
          <path d="M12 6.5c-1.5-1-4-1.5-6-1.2v13c2-.3 4.5.2 6 1.2 1.5-1 4-1.5 6-1.2v-13c-2-.3-4.5.2-6 1.2z" />
          <line x1="12" y1="6.5" x2="12" y2="19.5" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...stroke}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
    case "back":
      return (
        <svg {...stroke}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case "more":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      );
    case "info":
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "timer":
      return (
        <svg {...stroke}>
          <circle cx="12" cy="13" r="8" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="9" y1="2" x2="15" y2="2" />
        </svg>
      );
    case "note":
      return (
        <svg {...stroke}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      );
    case "camera":
      return (
        <svg {...stroke}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    default:
      return null;
  }
}
