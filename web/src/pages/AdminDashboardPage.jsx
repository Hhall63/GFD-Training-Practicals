import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { getAdminNavItems } from "../lib/navItems";
import bgImage from "../assets/work-hard-be-humble.jpg";

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const tiles = [["Start a Test", "/start-test"], ...getAdminNavItems()];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar title="Dashboard" />
      <div
        style={{
          flex: 1,
          backgroundImage: `url(${bgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          padding: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
            maxWidth: 480,
            margin: "0 auto",
          }}
        >
          {tiles.map(([label, path]) => (
            <button
              key={path}
              className="card"
              style={{
                aspectRatio: "1 / 1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 16,
                color: "var(--brand-navy)",
                background: "rgba(255,255,255,0.92)",
              }}
              onClick={() => navigate(path)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
