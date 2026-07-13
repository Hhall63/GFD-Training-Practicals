import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import { ensureBatchGradeSeedTemplates, createBatchGradeTemplate } from "../lib/batchGrade";

export default function BatchGradePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAddNew, setShowAddNew] = useState(false);

  useEffect(() => {
    ensureBatchGradeSeedTemplates();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isBatchGrade", "==", true),
      where("isActive", "==", true)
    );
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar title="Batch Grade" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <p className="muted">
          Grade every active recruit against one skill in one sitting, instead of running a
          full test per recruit.
        </p>

        <div className="field">
          <label>Test</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select a test…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <button className="secondary" style={{ marginBottom: 16 }} onClick={() => setShowAddNew(true)}>
          + Add New
        </button>

        <button
          className="primary"
          disabled={!selectedId}
          onClick={() => navigate(`/batch-grade/${selectedId}`)}
        >
          Start Grading
        </button>
      </div>

      {showAddNew && (
        <AddNewBatchTestModal
          onClose={() => setShowAddNew(false)}
          onCreated={(id) => {
            setShowAddNew(false);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

function AddNewBatchTestModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const created = await createBatchGradeTemplate(name.trim());
      onCreated(created.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 320, background: "white" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Add Batch Grade Test</h3>
        <div className="field">
          <input
            type="text"
            placeholder="Skill Name (e.g. Ladder Raise)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!name.trim() || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
