import { useState } from "react";
import Modal from "./Modal";

/** onSave(quesId, { stemText, answerText, points }) is awaited before the modal closes —
 * the caller (TestBankBuilder) is responsible for actually persisting the override. */
export default function TestBankQuestionEditor({ question, onSave, onClose }) {
  const [stemText, setStemText] = useState(question.stemText);
  const [answerText, setAnswerText] = useState(question.answerText);
  const [points, setPoints] = useState(question.points);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(question.quesId, { stemText, answerText, points: Number(points) });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal titleId="edit-question-title" onClose={onClose}>
      <h3 id="edit-question-title" style={{ marginTop: 0 }}>
        Edit Question
      </h3>
      <div className="field">
        <label>Question Text</label>
        <textarea rows={4} value={stemText} onChange={(e) => setStemText(e.target.value)} />
      </div>
      <div className="field">
        <label>Answer</label>
        <input type="text" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
      </div>
      <div className="field">
        <label>Points</label>
        <input type="number" min="0" value={points} onChange={(e) => setPoints(e.target.value)} />
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Saved to the drive alongside this bank — the original .LXRBank file is never modified.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
