import { useMemo, useState } from "react";
import { writeOverrides } from "../lib/testBankDrive";
import { saveTestBankReference } from "../lib/testBankExam";
import { buildAnswerKeyDocx, buildExamPaperDocx, downloadDocxBlob } from "../lib/examDocx";
import TestBankQuestionEditor from "./TestBankQuestionEditor";

function pickRandom(list, count) {
  const pool = [...list];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

export default function TestBankBuilder({
  examId,
  examName,
  dirHandle,
  bankFileName,
  questions,
  overrides,
  savedReference,
  onOverridesSaved,
  onSaved,
}) {
  const [workingIds, setWorkingIds] = useState(savedReference?.questionIds ?? []);
  const [drawCategory, setDrawCategory] = useState("");
  const [drawCount, setDrawCount] = useState(5);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [editingQuesId, setEditingQuesId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [drawMessage, setDrawMessage] = useState(null);
  const [generating, setGenerating] = useState(null); // "paper" | "key" | null
  const [classNumber, setClassNumber] = useState("");
  const [coverExamName, setCoverExamName] = useState("");

  const questionsById = useMemo(() => new Map(questions.map((q) => [q.quesId, q])), [questions]);
  const categories = useMemo(
    () => [...new Set(questions.map((q) => q.category))].sort((a, b) => a.localeCompare(b)),
    [questions]
  );
  const workingQuestions = useMemo(
    () =>
      workingIds
        .map((id) => questionsById.get(id))
        .filter(Boolean)
        .sort((a, b) => a.category.localeCompare(b.category) || a.seq - b.seq),
    [workingIds, questionsById]
  );
  const browseList = useMemo(() => {
    const term = search.trim().toLowerCase();
    return questions
      .filter((q) => q.supported)
      .filter((q) => {
        if (filterCategory && q.category !== filterCategory) return false;
        if (!term) return true;
        return q.stemText.toLowerCase().includes(term) || q.answerText.toLowerCase().includes(term);
      });
  }, [questions, filterCategory, search]);

  function toggleWorking(quesId) {
    setWorkingIds((prev) => (prev.includes(quesId) ? prev.filter((id) => id !== quesId) : [...prev, quesId]));
  }

  function handleDraw() {
    if (!drawCategory) return;
    const candidates = questions.filter((q) => q.category === drawCategory && q.supported && !workingIds.includes(q.quesId));
    const requested = Number(drawCount);
    const picked = pickRandom(candidates, requested);
    setWorkingIds((prev) => [...prev, ...picked.map((q) => q.quesId)]);
    if (picked.length === 0) {
      setDrawMessage(`No more available questions in "${drawCategory}" to draw.`);
    } else if (picked.length < requested) {
      setDrawMessage(
        `Added ${picked.length} question${picked.length === 1 ? "" : "s"} from "${drawCategory}" — that's all that were available (fewer than the ${requested} requested).`
      );
    } else {
      setDrawMessage(`Added ${picked.length} question${picked.length === 1 ? "" : "s"} from "${drawCategory}" to the working set.`);
    }
  }

  async function handleSaveReference() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const pointsById = Object.fromEntries(workingQuestions.map((q) => [q.quesId, q.points]));
      const saved = await saveTestBankReference(examId, { bankFileName, questionIds: workingIds, pointsById });
      onSaved(saved);
      setSaveMessage("Saved.");
    } catch (err) {
      setSaveMessage("Could not save: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate(kind) {
    setGenerating(kind);
    try {
      const blob =
        kind === "paper"
          ? await buildExamPaperDocx({ classNumber, coverExamName, questions: workingQuestions })
          : await buildAnswerKeyDocx({ examName, coverExamName, questions: workingQuestions });
      const suffix = kind === "paper" ? "Exam Paper" : "Answer Key";
      downloadDocxBlob(blob, `${examName} - ${suffix}.docx`);
    } finally {
      setGenerating(null);
    }
  }

  async function handleEditSave(quesId, fields) {
    const newOverrides = { ...overrides, [quesId]: { ...overrides[quesId], ...fields } };
    await writeOverrides(dirHandle, bankFileName, newOverrides);
    onOverridesSaved(newOverrides);
  }

  const editingQuestion = editingQuesId != null ? questionsById.get(editingQuesId) : null;
  const unsupportedCount = questions.filter((q) => !q.supported).length;

  return (
    <div>
      {unsupportedCount > 0 && (
        <p className="muted">
          {unsupportedCount} question{unsupportedCount === 1 ? "" : "s"} in this bank use an
          unsupported question type and are excluded below.
        </p>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Random Draw</h3>
        <div className="field">
          <label>Category</label>
          <select value={drawCategory} onChange={(e) => setDrawCategory(e.target.value)}>
            <option value="">Choose a category…</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>How many</label>
          <input type="number" min="1" value={drawCount} onChange={(e) => setDrawCount(e.target.value)} />
        </div>
        <button className="secondary" disabled={!drawCategory} onClick={handleDraw}>
          Draw Questions
        </button>
        {drawMessage && <p className="muted" style={{ marginTop: 8 }}>{drawMessage}</p>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Browse &amp; Add Manually</h3>
        <div className="field">
          <input
            type="text"
            placeholder="Search question or answer text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="field">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {browseList.map((q) => (
          <div key={q.quesId} className="list-row">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={workingIds.includes(q.quesId)}
                onChange={() => toggleWorking(q.quesId)}
                style={{ width: "auto", marginTop: 4 }}
              />
              <span>
                <span className="muted">
                  {q.category} · {q.points} pt
                </span>
                <br />
                {q.stemText}
              </span>
            </label>
            <button
              className="secondary"
              style={{ width: "auto", padding: "4px 10px" }}
              onClick={() => setEditingQuesId(q.quesId)}
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Working Set ({workingQuestions.length} question{workingQuestions.length === 1 ? "" : "s"})
        </h3>
        {workingQuestions.length === 0 && <p className="muted">No questions selected yet.</p>}
        {workingQuestions.map((q, index) => (
          <div key={q.quesId} className="list-row">
            <span style={{ flex: 1 }}>
              {index + 1}. <span className="muted">{q.category}</span> — {q.stemText}
            </span>
            <button
              className="secondary"
              style={{ width: "auto", padding: "4px 10px", color: "var(--brand-red)" }}
              onClick={() => toggleWorking(q.quesId)}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="field">
          <label>
            Class Number <span style={{ color: "var(--brand-red)" }}>*</span>
          </label>
          <input
            type="number"
            min="1"
            placeholder="e.g. 83"
            value={classNumber}
            onChange={(e) => setClassNumber(e.target.value)}
          />
        </div>
        <div className="field">
          <label>
            Exam Name (printed on the cover page) <span style={{ color: "var(--brand-red)" }}>*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Exam 1"
            value={coverExamName}
            onChange={(e) => setCoverExamName(e.target.value)}
          />
        </div>
        {(!classNumber || !coverExamName.trim()) && (
          <p className="muted" style={{ color: "var(--brand-red)" }}>
            Class Number and Exam Name are required before generating either document.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button className="primary" disabled={saving || workingQuestions.length === 0} onClick={handleSaveReference}>
            {saving ? "Saving…" : "Save Question Set"}
          </button>
          <button
            className="secondary"
            disabled={generating !== null || workingQuestions.length === 0 || !classNumber || !coverExamName.trim()}
            onClick={() => handleGenerate("paper")}
          >
            {generating === "paper" ? "Generating…" : "Generate Exam Paper (.docx)"}
          </button>
          <button
            className="secondary"
            disabled={generating !== null || workingQuestions.length === 0 || !classNumber || !coverExamName.trim()}
            onClick={() => handleGenerate("key")}
          >
            {generating === "key" ? "Generating…" : "Generate Answer Key (.docx)"}
          </button>
        </div>
        {saveMessage && <p className="muted" style={{ marginTop: 8 }}>{saveMessage}</p>}
      </div>

      {editingQuestion && (
        <TestBankQuestionEditor question={editingQuestion} onSave={handleEditSave} onClose={() => setEditingQuesId(null)} />
      )}
    </div>
  );
}
