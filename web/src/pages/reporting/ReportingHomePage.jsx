import { useNavigate } from "react-router-dom";
import TopBar from "../../components/TopBar";

export default function ReportingHomePage() {
  const navigate = useNavigate();
  const items = [
    ["Recruit History", "/reports/recruits"],
    ["Test Pass Rates", "/reports/templates"],
    ["Cohort Dashboard", "/reports/cohorts"],
    ["Export to Excel", "/reports/export"],
  ];
  return (
    <div className="app-shell">
      <TopBar title="Reports" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        {items.map(([label, path]) => (
          <button key={path} className="list-row" onClick={() => navigate(path)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
