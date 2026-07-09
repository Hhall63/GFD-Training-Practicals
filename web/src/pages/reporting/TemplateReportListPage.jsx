import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";

export default function TemplateReportListPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    getDocs(query(collection(db, "templates"), where("isActive", "==", true))).then((snap) =>
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)))
    );
  }, []);

  return (
    <div className="app-shell">
      <TopBar title="Test Pass Rates" onBack={() => navigate("/reports")} showMenu={false} />
      <div className="screen">
        {templates.map((t) => (
          <button key={t.id} className="list-row" onClick={() => navigate(`/reports/templates/${t.id}`)}>
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
