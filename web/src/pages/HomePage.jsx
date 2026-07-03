import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";

export default function HomePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "templates"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="screen">
        <h3 style={{ marginTop: 16 }}>Select a Test</h3>
        {!loading && templates.length === 0 && (
          <p className="muted">No test templates yet. Use Manage Tests to build one.</p>
        )}
        {templates.map((template) => (
          <button key={template.id} className="card list-row" style={{ display: "block" }} onClick={() => navigate(`/test/${template.id}`)}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{template.name}</div>
            {template.description && <div className="muted">{template.description}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
