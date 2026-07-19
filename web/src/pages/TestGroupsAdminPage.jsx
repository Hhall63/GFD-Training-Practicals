import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import Modal from "../components/Modal";

export default function TestGroupsAdminPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "testGroups"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setGroups(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  // Only active, published templates can be bundled into a group — same set an evaluator
  // could pick standalone from Home.
  useEffect(() => {
    const q = query(
      collection(db, "templates"),
      where("isActive", "==", true),
      where("status", "==", "published")
    );
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, []);

  async function deactivate(group) {
    await updateDoc(doc(db, "testGroups", group.id), { isActive: false });
  }

  function templateName(templateId) {
    return templates.find((t) => t.id === templateId)?.name ?? "(test no longer available)";
  }

  return (
    <div className="app-shell">
      <TopBar title="Test Groups" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <p className="muted">
          Bundle several existing tests together so one instructor can run a recruit through
          all of them back-to-back without re-picking the recruit each time. Each test in the
          group is still scored entirely on its own — there is no combined score.
        </p>
        {groups.length === 0 && (
          <p className="muted">No test groups yet. Build your first one to start bundling tests.</p>
        )}
        {groups.map((group) => (
          <div key={group.id} className="card">
            <div className="list-row" style={{ padding: 0, border: "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{group.name}</div>
                <div className="muted">{(group.templateIds ?? []).length} tests</div>
              </div>
              <button
                className="secondary"
                style={{ width: "auto", padding: "6px 12px", color: "var(--brand-red)" }}
                onClick={() => deactivate(group)}
              >
                Deactivate
              </button>
            </div>
            <ol style={{ margin: "10px 0 0", paddingLeft: 20 }}>
              {(group.templateIds ?? []).map((templateId) => (
                <li key={templateId} className="muted">
                  {templateName(templateId)}
                </li>
              ))}
            </ol>
          </div>
        ))}

        <button className="primary" style={{ marginTop: 16 }} onClick={() => setShowNew(true)}>
          + New Test Group
        </button>
      </div>

      {showNew && <NewTestGroupModal templates={templates} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function NewTestGroupModal({ templates, onClose }) {
  const [name, setName] = useState("");
  const [pickedIds, setPickedIds] = useState([]); // ordered
  const [saving, setSaving] = useState(false);

  function toggleTemplate(templateId) {
    setPickedIds((prev) =>
      prev.includes(templateId) ? prev.filter((id) => id !== templateId) : [...prev, templateId]
    );
  }

  // Same up/down reorder pattern as TemplateEditorPage's moveLine — here it just swaps
  // entries in local state instead of Firestore sortOrder fields, since this list isn't
  // persisted until "Create" is pressed.
  function moveTemplate(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= pickedIds.length) return;
    setPickedIds((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(target, 0, moved);
      return copy;
    });
  }

  function templateName(templateId) {
    return templates.find((t) => t.id === templateId)?.name ?? "(unknown test)";
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const now = new Date();
      await addDoc(collection(db, "testGroups"), {
        name,
        templateIds: pickedIds,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal titleId="new-test-group-title" onClose={onClose}>
      <h3 id="new-test-group-title" style={{ marginTop: 0 }}>New Test Group</h3>
        <div className="field">
          <input
            type="text"
            placeholder="Group Name (e.g. PPE Practicals)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <label style={{ fontSize: 14, fontWeight: 600 }}>Tests in this group</label>
        <p className="muted" style={{ marginTop: 4 }}>
          Check the tests to include, then use the arrows below to set the order they'll run in.
        </p>
        {templates.length === 0 && (
          <p className="muted">No published tests to choose from yet.</p>
        )}
        {templates.map((template) => (
          <label
            key={template.id}
            style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={pickedIds.includes(template.id)}
              onChange={() => toggleTemplate(template.id)}
              style={{ width: "auto", margin: 0, marginTop: 3 }}
            />
            <span>
              <div>{template.name}</div>
              {template.description && <div className="muted">{template.description}</div>}
            </span>
          </label>
        ))}

        {pickedIds.length > 0 && (
          <>
            <h4 style={{ marginBottom: 6 }}>Run Order</h4>
            {pickedIds.map((templateId, index) => (
              <div key={templateId} className="list-row">
                <div style={{ flex: 1 }}>
                  {index + 1}. {templateName(templateId)}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "4px 8px" }}
                    onClick={() => moveTemplate(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="secondary"
                    style={{ width: "auto", padding: "4px 8px" }}
                    onClick={() => moveTemplate(index, 1)}
                    disabled={index === pickedIds.length - 1}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!name || pickedIds.length < 2 || saving} onClick={handleCreate}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
    </Modal>
  );
}
