// web/src/pages/ExamsAdminPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";
import { createExamTemplate } from "../lib/exams";

export default function ExamsAdminPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isWrittenExam", "==", true),
      where("isActive", "==", true)
    );
    return onSnapshot(q, (snap) => {
      setExams(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (a.examCategory ?? "").localeCompare(b.examCategory ?? "") || a.name.localeCompare(b.name)
          )
      );
    });
  }, []);

  async function deactivate(exam) {
    await updateDoc(doc(db, "templates", exam.id), { isActive: false });
  }

  async function toggleSummary(exam) {
    await updateDoc(doc(db, "templates", exam.id), {
      includeInSummaryTranscript: !exam.includeInSummaryTranscript,
    });
  }

  const categories = [...new Set(exams.map((e) => e.examCategory).filter(Boolean))];

  return (
    <div className="app-shell">
      <TopBar title="Manage Exams" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <p className="muted">
          Define written exams for the gradebook. Every exam is scored out of 100, passing at 70%.
        </p>
        {exams.length === 0 && (
          <p className="muted">No exams yet. Create your first one to start grading.</p>
        )}
        {exams.map((exam) => (
          <div key={exam.id} className="card">
            <div className="list-row" style={{ padding: 0, border: "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{exam.name}</div>
                <div className="muted">{exam.examCategory}</div>
              </div>
              <button
                className="secondary"
                style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                onClick={() => deactivate(exam)}
              >
                Deactivate
              </button>
            </div>
            <label
              style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={!!exam.includeInSummaryTranscript}
                onChange={() => toggleSummary(exam)}
                style={{ width: "auto", margin: 0 }}
              />
              Include on Summary Transcript
            </label>
          </div>
        ))}
        <button className="primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>
          + New Exam
        </button>
      </div>

      {showNew && <NewExamModal categories={categories} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewExamModal({ categories, onClose }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const listId = "exam-category-options";

  async function handleCreate() {
    setSaving(true);
    try {
      await createExamTemplate({ name: name.trim(), category: category.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal titleId="new-exam-title" onClose={onClose}>
      <h3 id="new-exam-title" style={{ marginTop: 0 }}>New Exam</h3>
      <div className="field">
        <label>Name</label>
        <input
          type="text"
          placeholder="e.g. Fire Behavior Final"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Category</label>
        <input
          type="text"
          list={listId}
          placeholder="e.g. Written Exam"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={!name.trim() || !category.trim() || saving} onClick={handleCreate}>
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
  );
}
