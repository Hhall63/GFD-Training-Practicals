import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { getAdminNavItems } from "../lib/navItems";
import crest from "../assets/work-hard-be-humble.jpg";

// One restrained line-icon per destination so the grid scans in a glance. Keyed by route so
// the labels/paths stay the single source of truth in navItems.js.
function Icon({ name, size = 24 }) {
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
    case "chevron":
      return (
        <svg {...stroke}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
    default:
      return null;
  }
}

const ICON_BY_PATH = {
  "/recruits": "recruits",
  "/templates": "tests",
  "/test-groups": "groups",
  "/reports": "reports",
  "/admins?new=1": "addUser",
  "/admins": "users",
};

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const adminTiles = getAdminNavItems();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar title="Dashboard" />
      <div className="dashboard-canvas">
        <div className="dashboard-inner">
          <div className="card card--raised dashboard-masthead">
            <img
              src={crest}
              alt="Greensboro Fire Department — Work Hard, Be Humble"
              className="dashboard-masthead-crest"
            />
            <div className="dashboard-masthead-text">
              <span className="dashboard-masthead-title">GFD Recruit Testing</span>
              <span className="dashboard-masthead-sub">Greensboro Fire Department</span>
            </div>
          </div>

          <button
            className="card card--raised dashboard-primary"
            onClick={() => navigate("/start-test")}
          >
            <span className="dashboard-primary-icon">
              <Icon name="play" size={26} />
            </span>
            <span className="dashboard-primary-text">
              <span className="dashboard-primary-title">Start a Test</span>
              <span className="dashboard-primary-sub">Run a recruit through a practical</span>
            </span>
            <span className="dashboard-primary-chevron">
              <Icon name="chevron" size={22} />
            </span>
          </button>

          <p className="dashboard-section-label">Manage</p>
          <div className="dashboard-grid">
            {adminTiles.map(([label, path]) => (
              <button
                key={path}
                className="card card--raised dashboard-tile"
                onClick={() => navigate(path)}
              >
                <Icon name={ICON_BY_PATH[path]} size={24} />
                <span className="dashboard-tile-label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
