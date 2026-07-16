// web/src/pages/reporting/ClassReportsListPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import Modal from "../../components/Modal";
import { createClassReportFilter, deactivateClassReportFilter } from "../../lib/classReports";

export default function ClassReportsListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [cohorts, setCohorts] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "classReportFilters"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setFilters(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, "recruits"), where("isActive", "==", true))).then((snap) => {
      const set = new Set(
        snap.docs
          .map((d) => d.data())
          .filter((r) => !r.isPractice)
          .map((r) => r.recruitClassOrCohort)
          .filter(Boolean)
      );
      setCohorts([...set].sort());
    });
    getDocs(query(collection(db, "templates"), where("isActive", "==", true))).then((snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  async function handleDeactivate(filter) {
    await deactivateClassReportFilter(filter.id);
  }

  return (
    <div className="app-shell">
      <TopBar title="Class Reports" onBack={() => navigate("/reports")} showMenu={false} />
      <div className="screen">
        {filters.length === 0 && <p className="muted">No saved class reports yet.</p>}
        {filters.map((filter) => (
          <div key={filter.id} className="card">
            <div className="list-row" style={{ padding: 0, border: "none" }}>
              <div style={{ flex: 1 }} onClick={() => navigate(`/reports/class/${filter.id}`)}>
                <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{filter.name}</div>
                <div className="muted">
                  {filter.cohort} · {(filter.templateIds ?? []).length} tests
                </div>
              </div>
              <button
                className="secondary"
                style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                onClick={() => handleDeactivate(filter)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        <button className="primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>
          + New Class Report
        </button>
      </div>

      {showNew && (
        <NewClassReportModal
          cohorts={cohorts}
          templates={templates}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/reports/class/${id}`);
          }}
        />
      )}
    </div>
  );
}

function NewClassReportModal({ cohorts, templates, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [cohort, setCohort] = useState(cohorts[0] ?? "");
  const [pickedIds, setPickedIds] = useState([]);
  const [saving, setSaving] = useState(false);

  function toggleTemplate(templateId) {
    setPickedIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const created = await createClassReportFilter({ name: name.trim(), cohort, templateIds: pickedIds });
      onCreated(created.id);
    } finally {
      setSaving(false);
    }
  }

  const exams = templates.filter((t) => t.isWrittenExam);
  const practicals = templates.filter((t) => !t.isWrittenExam && !t.isBatchGrade);

  return (
    <Modal titleId="new-class-report-title" onClose={onClose} maxWidth={420}>
      <h3 id="new-class-report-title" style={{ marginTop: 0 }}>New Class Report</h3>
      <div className="field">
        <label>Report Name</label>
        <input
          type="text"
          placeholder="e.g. Recruit Class 47 — Finals"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Cohort</label>
        <select value={cohort} onChange={(e) => setCohort(e.target.value)}>
          {cohorts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <label style={{ fontSize: 14, fontWeight: 600 }}>Tests / Exams to Include</label>
      {exams.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 4, marginBottom: 4 }}>Written Exams</p>
          {exams.map((t) => (
            <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pickedIds.includes(t.id)}
                onChange={() => toggleTemplate(t.id)}
                style={{ width: "auto", margin: 0 }}
              />
              {t.name} <span className="muted">({t.examCategory})</span>
            </label>
          ))}
        </>
      )}
      {practicals.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 10, marginBottom: 4 }}>Practicals</p>
          {practicals.map((t) => (
            <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={pickedIds.includes(t.id)}
                onChange={() => toggleTemplate(t.id)}
                style={{ width: "auto", margin: 0 }}
              />
              {t.name}
            </label>
          ))}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={!name.trim() || !cohort || pickedIds.length === 0 || saving}
          onClick={handleCreate}
        >
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </Modal>
  );
}
