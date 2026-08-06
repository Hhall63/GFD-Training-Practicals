import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import Icon from "../components/Icon";
import { getAdminNavItems } from "../lib/navItems";
import crest from "../assets/work-hard-be-humble.jpg";

// Keyed by route so the labels/paths stay the single source of truth in navItems.js.
const ICON_BY_PATH = {
  "/recruits": "recruits",
  "/templates": "tests",
  "/test-groups": "groups",
  "/batch-grade": "batchGrade",
  "/exams": "testBank",
  "/exam-scores": "gradebook",
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
