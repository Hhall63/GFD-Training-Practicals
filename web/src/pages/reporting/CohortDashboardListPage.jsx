import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";

export default function CohortDashboardListPage() {
  const navigate = useNavigate();
  const [cohorts, setCohorts] = useState([]);

  useEffect(() => {
    getDocs(query(collection(db, "recruits"), where("isActive", "==", true))).then((snap) => {
      const set = new Set(snap.docs.map((d) => d.data().recruitClassOrCohort).filter(Boolean));
      setCohorts([...set].sort());
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar title="Cohort Dashboard" onBack={() => navigate("/reports")} showMenu={false} />
      <div className="screen">
        {cohorts.length === 0 && <p className="muted">No cohorts yet.</p>}
        {cohorts.map((cohort) => (
          <button key={cohort} className="list-row" onClick={() => navigate(`/reports/cohorts/${encodeURIComponent(cohort)}`)}>
            {cohort}
          </button>
        ))}
      </div>
    </div>
  );
}
