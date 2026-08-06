// web/src/pages/ExamsAdminPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";
import { createExamTemplate } from "../lib/exams";
import { categoryTagClass } from "../lib/categoryColor";

export default function ExamsAdminPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState(null); // null = first snapshot still loading
  const [showNew, setShowNew] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");

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

  const categories = useMemo(
    () => [...new Set((exams ?? []).map((e) => e.examCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [exams]
  );
  const visibleExams = useMemo(
    () => (exams ?? []).filter((e) => !categoryFilter || e.examCategory === categoryFilter),
    [exams, categoryFilter]
  );

  return (
    <div className="app-shell">
      <TopBar title="Test Bank" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen--wide screen--textured">
        <p className="muted">
          Define written exams for the gradebook. Every exam is scored out of 100, passing at 70%.
        </p>

        {exams === null && (
          <div className="exam-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card card--raised skeleton-exam-tile">
                <div className="skeleton-block skeleton-block--title" />
                <div className="skeleton-block skeleton-block--tag" />
                <div className="skeleton-block skeleton-block--line" />
                <div className="skeleton-block skeleton-block--button" />
              </div>
            ))}
          </div>
        )}

        {exams !== null && exams.length === 0 && (
          <p className="muted">No exams yet. Create your first one to start grading.</p>
        )}

        {exams !== null && exams.length > 0 && (
          <>
            {categories.length > 1 && (
              <div className="chip-row" role="group" aria-label="Filter by category">
                <button
                  type="button"
                  className={`chip${categoryFilter === "" ? " active" : ""}`}
                  onClick={() => setCategoryFilter("")}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip${categoryFilter === c ? " active" : ""}`}
                    onClick={() => setCategoryFilter(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            <div className="exam-grid">
              {visibleExams.map((exam) => (
                <div key={exam.id} className="card card--raised">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{exam.name}</div>
                    <button
                      className="secondary"
                      style={{ width: "auto", padding: "4px 10px", color: "var(--brand-red)" }}
                      onClick={() => deactivate(exam)}
                    >
                      Deactivate
                    </button>
                  </div>
                  {exam.examCategory && (
                    <span className={categoryTagClass(exam.examCategory)} style={{ marginTop: 6 }}>
                      {exam.examCategory}
                    </span>
                  )}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 12,
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!exam.includeInSummaryTranscript}
                      onChange={() => toggleSummary(exam)}
                      style={{ width: "auto", margin: 0 }}
                    />
                    Include on Summary Transcript
                  </label>
                  <button
                    className="secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => navigate(`/exams/${exam.id}/test-bank`)}
                  >
                    Build from Test Bank
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="primary" style={{ marginTop: 16, maxWidth: 280 }} onClick={() => setShowNew(true)}>
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
