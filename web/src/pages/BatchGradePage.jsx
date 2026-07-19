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
  const [officialTests, setOfficialTests] = useState([]);

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

  // The set of tests an admin can pick from in "Add New" below — published, non-batch-grade,
  // non-written-exam official tests (the same set TestGroupsAdminPage.jsx already draws its
  // own picker from). Picking one seeds a new lightweight batch-grade template with that
  // test's name/description; the official template itself is never touched.
  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isActive", "==", true),
      where("status", "==", "published")
    );
    return onSnapshot(q, (snap) => {
      setOfficialTests(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => !t.isBatchGrade && !t.isWrittenExam)
          .sort((a, b) => a.name.localeCompare(b.name))
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
          officialTests={officialTests}
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

function AddNewBatchTestModal({ officialTests, onClose, onCreated }) {
  const [creatingId, setCreatingId] = useState(null);

  async function handlePick(test) {
    setCreatingId(test.id);
    try {
      const created = await createBatchGradeTemplate(test.name, test.description ?? "");
      onCreated(created.id);
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <Modal titleId="add-new-batch-test-title" onClose={onClose} maxWidth={420}>
      <h3 id="add-new-batch-test-title" style={{ marginTop: 0 }}>Add Batch Grade Test</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Pick an existing published test to add to the Batch Grade list. The original test is
        unchanged — this just adds a quick pass/fail entry for it here.
      </p>
      {officialTests.length === 0 && <p className="muted">No published tests available yet.</p>}
      <div role="listbox" aria-labelledby="add-new-batch-test-title" style={{ maxHeight: "60vh", overflowY: "auto" }}>
        {officialTests.map((test) => (
          <button
            key={test.id}
            type="button"
            role="option"
            className="test-tile"
            disabled={creatingId !== null}
            onClick={() => handlePick(test)}
          >
            <div style={{ fontWeight: 600, fontSize: 16 }}>{test.name}</div>
            {test.description && <div className="muted">{test.description}</div>}
          </button>
        ))}
      </div>
    </Modal>
  );
}
