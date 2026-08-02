import { useMemo, useState } from "react";
import { writeOverrides } from "../lib/testBankDrive";
import { saveTestBankReference } from "../lib/testBankExam";
import { buildAnswerKeyDocx, buildExamPaperDocx, downloadDocxBlob } from "../lib/examDocx";
import { categoryTagClass } from "../lib/categoryColor";
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

// Used to gate "Generate Version B": the saved shuffle is only valid for the exact
// question set it was computed from, not a superset/subset after further edits.
function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
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
  const [generating, setGenerating] = useState(null); // "A" | "B" | null
  const [classNumber, setClassNumber] = useState("");
  const [coverExamName, setCoverExamName] = useState("");
  const [touched, setTouched] = useState({ classNumber: false, coverExamName: false });

  const questionsById = useMemo(() => new Map(questions.map((q) => [q.quesId, q])), [questions]);
  const categories = useMemo(
    () => [...new Set(questions.map((q) => q.category))].sort((a, b) => a.localeCompare(b)),
    [questions]
  );
  const supportedQuestions = useMemo(() => questions.filter((q) => q.supported), [questions]);
  const workingQuestions = useMemo(
    () => workingIds.map((id) => questionsById.get(id)).filter(Boolean),
    [workingIds, questionsById]
  );
  const savedBIds = savedReference?.bQuestionIds ?? [];
  const workingBQuestions = useMemo(
    () => savedBIds.map((id) => questionsById.get(id)).filter(Boolean),
    [savedBIds, questionsById]
  );
  const bAvailable = savedBIds.length > 0 && sameIdSet(workingIds, savedBIds);
  const browseList = useMemo(() => {
    const term = search.trim().toLowerCase();
    return supportedQuestions.filter((q) => {
      if (filterCategory && q.category !== filterCategory) return false;
      if (!term) return true;
      return q.stemText.toLowerCase().includes(term) || q.answerText.toLowerCase().includes(term);
    });
  }, [supportedQuestions, filterCategory, search]);

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

  async function handleGenerate(version) {
    setGenerating(version);
    try {
      const versionQuestions = version === "A" ? workingQuestions : workingBQuestions;
      const versionCoverName = `${coverExamName}-${version}`;
      const paperBlob = await buildExamPaperDocx({ classNumber, coverExamName: versionCoverName, questions: versionQuestions });
      downloadDocxBlob(paperBlob, `${examName} - ${version} - Exam Paper.docx`);
      const keyBlob = await buildAnswerKeyDocx({ classNumber, coverExamName: versionCoverName, questions: versionQuestions });
      downloadDocxBlob(keyBlob, `${examName} - ${version} - Answer Key.docx`);
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
  const unsupportedCount = questions.length - supportedQuestions.length;
  const missingClassNumber = !classNumber;
  const missingExamName = !coverExamName.trim();
  const showClassNumberError = touched.classNumber && missingClassNumber;
  const showExamNameError = touched.coverExamName && missingExamName;

  return (
    <div>
      {unsupportedCount > 0 && (
        <p className="muted">
          {unsupportedCount} question{unsupportedCount === 1 ? "" : "s"} in this bank use an
          unsupported question type and are excluded below.
        </p>
      )}

      <div className="builder-layout">
        <div className="builder-main">
          <div className="card card--raised">
            <h3 className="step-heading">
              <span className="step-badge" aria-hidden="true">
                1
              </span>
              Random Draw
            </h3>
            <div className="field">
              <label htmlFor="tb-draw-category">Category</label>
              <select id="tb-draw-category" value={drawCategory} onChange={(e) => setDrawCategory(e.target.value)}>
                <option value="">Choose a category…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tb-draw-count">How many</label>
              <input
                id="tb-draw-count"
                type="number"
                min="1"
                value={drawCount}
                onChange={(e) => setDrawCount(e.target.value)}
              />
            </div>
            <button className="secondary" disabled={!drawCategory} onClick={handleDraw}>
              Draw Questions
            </button>
            {drawMessage && (
              <p className="muted" style={{ marginTop: 8 }} aria-live="polite">
                {drawMessage}
              </p>
            )}
          </div>

          <div className="card card--raised">
            <h3 className="step-heading">
              <span className="step-badge" aria-hidden="true">
                2
              </span>
              Browse &amp; Add Manually
            </h3>
            {supportedQuestions.length > 0 && (
              <>
                <div className="field">
                  <label htmlFor="tb-search" className="sr-only">
                    Search question or answer text
                  </label>
                  <input
                    id="tb-search"
                    type="text"
                    placeholder="Search question or answer text…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="tb-filter-category" className="sr-only">
                    Filter by category
                  </label>
                  <select id="tb-filter-category" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {supportedQuestions.length === 0 && (
              <p className="muted">
                All {questions.length} question{questions.length === 1 ? "" : "s"} in this bank use
                an unsupported question type — none can be added here.
              </p>
            )}
            {supportedQuestions.length > 0 && browseList.length === 0 && (
              <p className="muted">No questions match your search.</p>
            )}
            {browseList.map((q) => (
              <div key={q.quesId} className="list-row list-row--hoverable">
                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={workingIds.includes(q.quesId)}
                    onChange={() => toggleWorking(q.quesId)}
                    style={{ width: "auto", marginTop: 4 }}
                  />
                  <span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                      <span className={categoryTagClass(q.category)}>{q.category}</span>
                      <span className="muted">{q.points} pt</span>
                    </span>
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
        </div>

        <div className="builder-side">
          <div className="card card--raised">
            <h3 className="step-heading">
              <span className="step-badge" aria-hidden="true">
                3
              </span>
              Working Set ({workingQuestions.length} question{workingQuestions.length === 1 ? "" : "s"})
            </h3>
            {workingQuestions.length === 0 && <p className="muted">No questions selected yet.</p>}
            {workingQuestions.map((q, index) => (
              <div key={q.quesId} className="list-row">
                <span style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <span className="muted">{index + 1}.</span>
                  <span className={categoryTagClass(q.category)}>{q.category}</span>
                  <span>{q.stemText}</span>
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
          </div>

          <div className="card card--raised">
            <h3 className="step-heading">
              <span className="step-badge" aria-hidden="true">
                4
              </span>
              Finalize &amp; Export
            </h3>
            <div className="field">
              <label htmlFor="tb-class-number">
                Class Number <span style={{ color: "var(--brand-red)" }}>*</span>
              </label>
              <input
                id="tb-class-number"
                type="number"
                min="1"
                placeholder="e.g. 83"
                required
                aria-required="true"
                aria-describedby={showClassNumberError ? "tb-class-number-error" : undefined}
                value={classNumber}
                onChange={(e) => setClassNumber(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, classNumber: true }))}
              />
              {showClassNumberError && (
                <p id="tb-class-number-error" className="field-error">
                  Class Number is required before generating either document.
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="tb-exam-name">
                Exam Name (printed on the cover page) <span style={{ color: "var(--brand-red)" }}>*</span>
              </label>
              <input
                id="tb-exam-name"
                type="text"
                placeholder="e.g. Exam 1"
                required
                aria-required="true"
                aria-describedby={showExamNameError ? "tb-exam-name-error" : undefined}
                value={coverExamName}
                onChange={(e) => setCoverExamName(e.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, coverExamName: true }))}
              />
              {showExamNameError && (
                <p id="tb-exam-name-error" className="field-error">
                  Exam Name is required before generating either document.
                </p>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="primary"
                style={{ width: "auto" }}
                disabled={saving || workingQuestions.length === 0}
                onClick={handleSaveReference}
              >
                {saving ? "Saving…" : "Save Question Set"}
              </button>
              <button
                className="secondary"
                style={{ width: "auto" }}
                disabled={generating !== null || workingQuestions.length === 0 || missingClassNumber || missingExamName}
                onClick={() => handleGenerate("A")}
              >
                {generating === "A" ? "Generating…" : "Generate Version A"}
              </button>
              <button
                className="secondary"
                style={{ width: "auto" }}
                disabled={generating !== null || workingQuestions.length === 0 || missingClassNumber || missingExamName || !bAvailable}
                onClick={() => handleGenerate("B")}
              >
                {generating === "B" ? "Generating…" : "Generate Version B"}
              </button>
            </div>
            {!bAvailable && workingQuestions.length > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                Save Question Set to lock in Version B.
              </p>
            )}
            {saveMessage && (
              <p className="muted" style={{ marginTop: 8 }} aria-live="polite">
                {saveMessage}
              </p>
            )}
          </div>
        </div>
      </div>

      {editingQuestion && (
        <TestBankQuestionEditor question={editingQuestion} onSave={handleEditSave} onClose={() => setEditingQuesId(null)} />
      )}
    </div>
  );
}
