import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import { LINE_TYPE_LABELS, LINE_TYPES } from "../lib/constants";

const DEFAULT_PASSING_PERCENTAGE = 70;

export default function TemplateEditorPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [lines, setLines] = useState([]);
  const [editingLine, setEditingLine] = useState(null); // null = closed, {} = new, {...} = existing

  useEffect(() => {
    getDoc(doc(db, "templates", templateId)).then((snap) => setTemplate({ id: snap.id, ...snap.data() }));
  }, [templateId]);

  useEffect(() => {
    const q = query(collection(db, "templates", templateId, "lines"), orderBy("sortOrder"));
    return onSnapshot(q, (snap) => setLines(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [templateId]);

  // Total points possible is always derived live from the current steps, rather than
  // stored, so it can never drift out of sync as steps are added/edited/removed.
  const totalPointsPossible = useMemo(
    () => lines.reduce((sum, line) => sum + (line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : 0), 0),
    [lines]
  );
  const passingPercentage = template?.passingPercentage ?? DEFAULT_PASSING_PERCENTAGE;
  const pointsNeededToPass = Math.ceil((passingPercentage / 100) * totalPointsPossible);

  async function saveDetails(field, value) {
    setTemplate((t) => ({ ...t, [field]: value }));
    await updateDoc(doc(db, "templates", templateId), { [field]: value, updatedAt: new Date() });
  }

  async function deleteLine(line) {
    await deleteDoc(doc(db, "templates", templateId, "lines", line.id));
    const remaining = lines.filter((l) => l.id !== line.id);
    const batch = writeBatch(db);
    remaining.forEach((l, index) => {
      batch.update(doc(db, "templates", templateId, "lines", l.id), { sortOrder: index });
    });
    await batch.commit();
  }

  async function moveLine(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "templates", templateId, "lines", lines[index].id), { sortOrder: target });
    batch.update(doc(db, "templates", templateId, "lines", lines[target].id), { sortOrder: index });
    await batch.commit();
  }

  if (!template) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  return (
    <div className="app-shell">
      <TopBar title={template.name} onBack={() => navigate("/templates")} showMenu={false} />
      <div className="screen">
        <div className="card">
          <div className="field">
            <label>Name</label>
            <input type="text" value={template.name} onChange={(e) => saveDetails("name", e.target.value)} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={2} value={template.description ?? ""} onChange={(e) => saveDetails("description", e.target.value)} />
          </div>

          <div className="field" style={{ marginBottom: 0 }}>
            <label>Passing Score</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="number"
                min={1}
                max={100}
                style={{ width: 90, marginBottom: 0 }}
                value={passingPercentage}
                onChange={(e) => saveDetails("passingPercentage", Number(e.target.value))}
              />
              <span>%</span>
              <span className="muted">
                = {pointsNeededToPass} of <strong>{totalPointsPossible}</strong> total points
              </span>
            </div>
          </div>
        </div>

        <h4>Test Steps, In Order</h4>
        <p className="muted" style={{ marginTop: -8 }}>Steps run top to bottom during a live test.</p>

        {lines.map((line, index) => (
          <div key={line.id} className="list-row">
            <div style={{ flex: 1 }} onClick={() => setEditingLine(line)}>
              <div style={{ fontWeight: 500 }}>{line.lineText}</div>
              <div className="muted">
                {LINE_TYPE_LABELS[line.lineType]}
                {line.lineType === LINE_TYPES.TIMER && line.passThresholdSeconds != null && ` — pass at ≤ ${line.passThresholdSeconds}s`}
                {line.lineType !== LINE_TYPES.INSTRUCTION && ` — ${line.points ?? 0} pts`}
                {line.isCritical && <span style={{ color: "var(--brand-red)", fontWeight: 600 }}> — CRITICAL</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className="secondary" style={{ width: "auto", padding: "4px 8px" }} onClick={() => moveLine(index, -1)} disabled={index === 0}>↑</button>
              <button className="secondary" style={{ width: "auto", padding: "4px 8px" }} onClick={() => moveLine(index, 1)} disabled={index === lines.length - 1}>↓</button>
              <button className="secondary" style={{ width: "auto", padding: "4px 8px", color: "var(--brand-red)" }} onClick={() => deleteLine(line)}>✕</button>
            </div>
          </div>
        ))}

        <button className="primary" style={{ marginTop: 16 }} onClick={() => setEditingLine({})}>
          + Add Step
        </button>
        <button className="secondary" style={{ marginTop: 12, width: "100%" }} onClick={() => navigate("/")}>
          Save & Exit
        </button>
      </div>

      {editingLine && (
        <LineEditorModal
          templateId={templateId}
          line={editingLine}
          nextSortOrder={lines.length}
          onClose={() => setEditingLine(null)}
        />
      )}
    </div>
  );
}

function LineEditorModal({ templateId, line, nextSortOrder, onClose }) {
  const isNew = !line.id;
  const [lineType, setLineType] = useState(line.lineType ?? LINE_TYPES.GRADED);
  const [lineText, setLineText] = useState(line.lineText ?? "");
  const [passThresholdSeconds, setPassThresholdSeconds] = useState(line.passThresholdSeconds ?? 30);
  const [points, setPoints] = useState(line.points ?? 10);
  const [isCritical, setIsCritical] = useState(line.isCritical ?? false);
  const [saving, setSaving] = useState(false);

  const isObstacleCourse = lineType === LINE_TYPES.OBSTACLE_COURSE;

  async function handleSave() {
    setSaving(true);
    try {
      const data = {
        lineType,
        // The obstacle course is a fixed department form, so it carries its own name rather
        // than a free-text description — this keeps a clean label everywhere (results, the
        // failure email, CSV) with no chance of stray text getting stored.
        lineText: isObstacleCourse ? LINE_TYPE_LABELS[LINE_TYPES.OBSTACLE_COURSE] : lineText,
        isScored: lineType === LINE_TYPES.GRADED,
        passThresholdSeconds: lineType === LINE_TYPES.TIMER ? Number(passThresholdSeconds) : null,
        points: isObstacleCourse ? 100 : lineType !== LINE_TYPES.INSTRUCTION ? Number(points) : null,
        isCritical: isObstacleCourse ? true : lineType !== LINE_TYPES.INSTRUCTION ? isCritical : false,
      };
      if (isNew) {
        data.sortOrder = nextSortOrder;
        await addDoc(collection(db, "templates", templateId, "lines"), data);
      } else {
        await updateDoc(doc(db, "templates", templateId, "lines", line.id), data);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 340, background: "white", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{isNew ? "New Step" : "Edit Step"}</h3>

        <div className="field">
          <label>Type</label>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.values(LINE_TYPES).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setLineType(type)}
                style={{
                  flex: 1,
                  padding: "8px 4px",
                  fontSize: 13,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: lineType === type ? "var(--brand-navy)" : "white",
                  color: lineType === type ? "white" : "var(--text)",
                  cursor: "pointer",
                }}
              >
                {LINE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {!isObstacleCourse && (
          <div className="field">
            <label>{lineType === LINE_TYPES.INSTRUCTION ? "Instruction Text" : "Step Description"}</label>
            <textarea rows={3} value={lineText} onChange={(e) => setLineText(e.target.value)} />
          </div>
        )}

        {lineType === LINE_TYPES.TIMER && (
          <div className="field">
            <label>Pass at ≤ seconds</label>
            <input
              type="number"
              min={1}
              value={passThresholdSeconds}
              onChange={(e) => setPassThresholdSeconds(e.target.value)}
            />
          </div>
        )}

        {isObstacleCourse && (
          <div className="field">
            <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>
              This is the fixed GFD SRFF driving/EVD obstacle course. Scoring (time tiers,
              cone/line/stop penalties, and the 6-cone / 6:30 automatic-failure rules) is
              built in — nothing to configure. During a test the evaluator taps the course
              diagram to mark penalties. Worth 100 pts and always critical.
            </p>
          </div>
        )}

        {!isObstacleCourse && lineType !== LINE_TYPES.INSTRUCTION && (
          <div className="field">
            <label>Points</label>
            <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} />
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Full points are earned on a Pass{lineType === LINE_TYPES.TIMER ? " (finishing within the time limit)" : ""}, zero on a Fail.
            </p>
          </div>
        )}

        {!isObstacleCourse && lineType !== LINE_TYPES.INSTRUCTION && (
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
              <input
                type="checkbox"
                checked={isCritical}
                onChange={(e) => setIsCritical(e.target.checked)}
                style={{ width: "auto", margin: 0 }}
              />
              Critical failure
            </label>
            <p className="muted" style={{ marginTop: 4, marginBottom: 0 }}>
              Failing this step fails the entire test automatically, no matter the point total.
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={(!lineText && !isObstacleCourse) || saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
