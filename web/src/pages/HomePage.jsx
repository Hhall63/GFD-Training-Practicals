import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";

export default function HomePage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [testGroups, setTestGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Non-admins are only permitted (by the security rules) to query published tests, so
    // the status filter is part of the query, not just client-side cosmetics. Admins see
    // everything, with drafts badged.
    const constraints = [where("isActive", "==", true)];
    if (!isAdmin) constraints.push(where("status", "==", "published"));
    const q = query(collection(db, "templates"), ...constraints);
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    });
  }, [isAdmin]);

  useEffect(() => {
    // Test Groups bundle several existing templates for back-to-back running (Task 9). Only
    // active groups are ever listed here — same convention as the templates query above.
    const q = query(collection(db, "testGroups"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setTestGroups(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="screen">
        <h3 style={{ marginTop: 16 }}>Select a Test</h3>
        {!loading && templates.length === 0 && testGroups.length === 0 && (
          <p className="muted">No tests available yet.</p>
        )}
        {testGroups.map((group) => (
          <button
            key={group.id}
            className="test-tile"
            style={{ display: "block" }}
            onClick={() => navigate(`/test/group/${group.id}`)}
          >
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {group.name}
              <span className="badge neutral" style={{ marginLeft: 8 }}>
                {(group.templateIds ?? []).length} tests
              </span>
            </div>
            <div className="muted">Run all tests in this group back-to-back for one recruit.</div>
          </button>
        ))}
        {templates.map((template) => {
          const isDraft = isAdmin && (template.status ?? "published") === "draft";
          return (
            <button key={template.id} className="test-tile" style={{ display: "block" }} onClick={() => navigate(`/test/${template.id}`)}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>
                {template.name}
                {isDraft && <span className="badge neutral" style={{ marginLeft: 8 }}>Draft</span>}
              </div>
              {template.description && <div className="muted">{template.description}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
