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
          position: "relative",
          background: "linear-gradient(160deg, var(--brand-navy), var(--brand-navy-2))",
          overflow: "hidden",
          padding: "28px 20px",
        }}
      >
        {/* Emblem shown small, contained and low-opacity as a deliberate backdrop accent behind
            the tile grid — anchored near the top of the content area (not centered in the full
            flex height) so it stays behind the tiles instead of drifting below them on tall
            viewports. Not stretched full-bleed like the previous "background-size: cover"
            treatment. */}
        <img
          src={bgImage}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(320px, 80%)",
            height: "auto",
            opacity: 0.14,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          {tiles.map(([label, path]) => (
            <button
              key={path}
              className="card card--raised"
              style={{
                minHeight: 92,
                maxWidth: 200,
                justifySelf: "center",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 13,
                lineHeight: 1.25,
                color: "var(--brand-navy)",
                padding: "10px 8px",
                margin: 0,
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
