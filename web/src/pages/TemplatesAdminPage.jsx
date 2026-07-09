import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";

export default function TemplatesAdminPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "templates"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  async function retire(template) {
    await updateDoc(doc(db, "templates", template.id), { isActive: false });
  }

  async function setStatus(template, status) {
    await updateDoc(doc(db, "templates", template.id), { status, updatedAt: new Date() });
  }

  return (
    <div className="app-shell">
      <TopBar title="Test Templates" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <p className="muted">
          Drafts are visible to administrators only. Publish a test to make it available to
          evaluators (and visible on recruits' status lists).
        </p>
        {templates.length === 0 && (
          <p className="muted">No test templates yet. Build your first one to start evaluating recruits.</p>
        )}
        {templates.map((template) => {
          // Templates created before the draft feature have no status — they were already
          // live, so they count as published.
          const status = template.status ?? "published";
          return (
            <div key={template.id} className="card">
              <div className="list-row" style={{ padding: 0, border: "none" }}>
                <div style={{ flex: 1 }} onClick={() => navigate(`/templates/${template.id}`)}>
                  <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>
                    {template.name}{" "}
                    <span className={`badge ${status === "published" ? "pass" : "neutral"}`}>
                      {status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                </div>
                <button
                  className="secondary"
                  style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                  onClick={() => retire(template)}
                >
                  Retire
                </button>
              </div>
              <div className="segmented" style={{ marginTop: 10 }}>
                {[
                  ["draft", "Draft"],
                  ["published", "Published"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`segment${status === value ? " active" : ""}`}
                    onClick={() => setStatus(template, value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        <button className="primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>
          + New Test Template
        </button>
      </div>

      {showNew && (
        <NewTemplateModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/templates/${id}`);
          }}
        />
      )}
    </div>
  );
}

function NewTemplateModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      const now = new Date();
      const created = await addDoc(collection(db, "templates"), {
        name,
        description: description || null,
        version: 1,
        isActive: true,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
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
        <h3 style={{ marginTop: 0 }}>New Test Template</h3>
        <div className="field">
          <input type="text" placeholder="Test Name (e.g. Ladder Raise Evolution)" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <textarea placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          New tests start as <strong>Draft</strong> — publish from the test list when ready.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!name || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
