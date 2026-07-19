import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";
import { ensureBatchGradeSeedTemplates, createBatchGradeTemplate } from "../lib/batchGrade";

export default function BatchGradePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showAddNew, setShowAddNew] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

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
          <button type="button" className="picker-trigger" onClick={() => setPickerOpen(true)}>
            <span className="picker-trigger-text">
              {selectedTemplate ? (
                <>
                  <div style={{ fontWeight: 600 }}>{selectedTemplate.name}</div>
                  {selectedTemplate.description && (
                    <div className="muted">{selectedTemplate.description}</div>
                  )}
                </>
              ) : (
                <span className="picker-trigger-placeholder">Select a test…</span>
              )}
            </span>
            <svg
              className="picker-trigger-chevron"
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
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

      {pickerOpen && (
        <Modal titleId="test-picker-title" onClose={() => setPickerOpen(false)} maxWidth={420}>
          <h3 id="test-picker-title" style={{ marginTop: 0 }}>Select a Test</h3>
          {templates.length === 0 && <p className="muted">No tests available yet.</p>}
          <div role="listbox" aria-labelledby="test-picker-title" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={t.id === selectedId}
                className="test-tile"
                onClick={() => {
                  setSelectedId(t.id);
                  setPickerOpen(false);
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 16 }}>{t.name}</div>
                {t.description && <div className="muted">{t.description}</div>}
              </button>
            ))}
          </div>
        </Modal>
      )}

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
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const created = await createBatchGradeTemplate(name.trim(), description.trim());
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
          <label>Skill Name</label>
          <input
            type="text"
            placeholder="e.g. Ladder Raise"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <textarea
            rows={2}
            placeholder="What does this skill require? Shown to evaluators when picking a test."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
