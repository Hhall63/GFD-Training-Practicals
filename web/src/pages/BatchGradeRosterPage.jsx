import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { initials, RESULT } from "../lib/constants";
import { compressImageToDataUrl } from "../lib/image";
import { PRACTICE_RECRUIT_ID } from "../lib/practiceRecruit";
import { recordBatchGradeResult } from "../lib/batchGrade";

export default function BatchGradeRosterPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { adminDoc } = useAuth();
  const [template, setTemplate] = useState(null);
  const [recruits, setRecruits] = useState([]);
  const [gradedByRecruitId, setGradedByRecruitId] = useState({}); // recruitId -> "pass" | "fail"
  const [failTarget, setFailTarget] = useState(null); // recruit currently being fail-noted, or null
  const [savingRecruitId, setSavingRecruitId] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "templates", templateId)).then((snap) => {
      if (snap.exists()) setTemplate({ id: snap.id, ...snap.data() });
    });
  }, [templateId]);

  useEffect(() => {
    const q = query(collection(db, "recruits"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setRecruits(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((r) => !r.isPractice && r.id !== PRACTICE_RECRUIT_ID)
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, []);

  async function gradePass(recruit) {
    setSavingRecruitId(recruit.id);
    try {
      await recordBatchGradeResult({
        template,
        recruit,
        evaluatorName: adminDoc.displayName,
        result: RESULT.PASS,
        note: null,
        photoURLs: [],
      });
      setGradedByRecruitId((prev) => ({ ...prev, [recruit.id]: RESULT.PASS }));
    } finally {
      setSavingRecruitId(null);
    }
  }

  async function confirmFail(recruit, note, photoURLs) {
    setSavingRecruitId(recruit.id);
    try {
      await recordBatchGradeResult({
        template,
        recruit,
        evaluatorName: adminDoc.displayName,
        result: RESULT.FAIL,
        note,
        photoURLs,
      });
      setGradedByRecruitId((prev) => ({ ...prev, [recruit.id]: RESULT.FAIL }));
      setFailTarget(null);
    } finally {
      setSavingRecruitId(null);
    }
  }

  if (!template) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="app-shell">
      <TopBar title={template.name} onBack={() => navigate("/batch-grade")} showMenu={false} />
      <div className="screen--wide">
        {recruits.length === 0 && <p className="muted">No active recruits to grade.</p>}
        <div className="recruit-grid">
          {recruits.map((recruit) => {
            const graded = gradedByRecruitId[recruit.id];
            const isSaving = savingRecruitId === recruit.id;
            return (
              <div key={recruit.id} className="card card--raised">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {recruit.photoURL ? (
                    <img src={recruit.photoURL} className="avatar" alt="" />
                  ) : (
                    <div className="avatar">{initials(recruit.firstName, recruit.lastName)}</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {recruit.firstName} {recruit.lastName}
                    </div>
                    <div className="muted">{recruit.recruitClassOrCohort}</div>
                  </div>
                </div>

                {graded ? (
                  <span
                    className={`badge ${graded === RESULT.PASS ? "pass" : "fail"}`}
                    style={{ display: "block", textAlign: "center", marginTop: 10 }}
                  >
                    {graded === RESULT.PASS ? "PASS" : "FAIL"}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="primary"
                      style={{ flex: 1 }}
                      disabled={isSaving}
                      onClick={() => gradePass(recruit)}
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      style={{ flex: 1, color: "var(--brand-red)" }}
                      disabled={isSaving}
                      onClick={() => setFailTarget(recruit)}
                    >
                      Fail
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {failTarget && (
        <FailNoteModal
          recruit={failTarget}
          onClose={() => setFailTarget(null)}
          onConfirm={(note, photoURLs) => confirmFail(failTarget, note, photoURLs)}
        />
      )}
    </div>
  );
}

function FailNoteModal({ recruit, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  const [photoURLs, setPhotoURLs] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageToDataUrl(file);
    setPhotoURLs((prev) => [...prev, dataUrl]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onConfirm(note.trim(), photoURLs);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ maxWidth: 340, padding: 24, textAlign: "left" }}>
        <h3 style={{ marginBottom: 8 }}>Note Required</h3>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          {recruit.firstName} {recruit.lastName} failed. Add a note explaining what happened
          before submitting.
        </p>
        <textarea
          autoFocus
          rows={3}
          placeholder="What did the recruit fail on?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ width: "100%" }}
        />
        <div className="field" style={{ marginTop: 10 }}>
          <label>Photo (optional)</label>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button className="secondary" style={{ flex: 1 }} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="primary"
            style={{ flex: 1 }}
            disabled={!note.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Saving…" : "Save & Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
