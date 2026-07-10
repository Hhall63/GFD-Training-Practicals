import { useState } from "react";
import { useNavigate } from "react-router-dom";
import badge from "../assets/gfd-badge.png";
import { useAuth } from "../context/AuthContext";
import { getAdminNavItems } from "../lib/navItems";

export default function TopBar({ title = "GFD Recruit Testing", showMenu = true, onBack }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Only administrators get management/reporting links — evaluators and recruits see just
  // Sign Out (the routes are also gated in App.jsx and by the security rules).
  const menuItems = isAdmin ? getAdminNavItems() : [];

  return (
    <div className="top-bar">
      {onBack && (
        <button className="icon-button" onClick={onBack} aria-label="Back">
          ←
        </button>
      )}
      <img src={badge} alt="GFD Badge" />
      <h1>{title}</h1>
      {showMenu && (
        <div style={{ position: "relative" }}>
          <button className="icon-button" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            ⋯
          </button>
          {menuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 32,
                background: "white",
                color: "#1c1c28",
                borderRadius: 10,
                boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                minWidth: 200,
                overflow: "hidden",
                zIndex: 20,
              }}
            >
              {menuItems.map(([label, path]) => (
                <button
                  key={path}
                  className="list-row"
                  style={{ padding: "12px 16px", border: "none" }}
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(path);
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                className="list-row"
                style={{ padding: "12px 16px", border: "none", color: "var(--brand-red)" }}
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
