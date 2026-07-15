// web/src/pages/ExamScoresGradingPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { initials, RESULT } from "../lib/constants";
import { PRACTICE_RECRUIT_ID } from "../lib/practiceRecruit";
import { loadExamGrades, getSingleLineResultId, recordExamScore, updateExamScore } from "../lib/exams";

function isValidScore(value) {
  if (value === "" || value == null) return true;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

export default function ExamScoresGradingPage() {
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const examDate = searchParams.get("date");
  const cohortFilter = searchParams.get("cohort") ?? "All";
  const navigate = useNavigate();
  const { adminDoc } = useAuth();

  const [template, setTemplate] = useState(null);
  const [recruits, setRecruits] = useState([]);
  const [grades, setGrades] = useState(new Map()); // recruitId -> { original, retake }
  const [drafts, setDrafts] = useState({}); // recruitId -> { score, retestScore, showRetest }
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState({});

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
          .filter((r) => cohortFilter === "All" || r.recruitClassOrCohort === cohortFilter)
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, [cohortFilter]);

  useEffect(() => {
    loadExamGrades(templateId).then(setGrades);
  }, [templateId]);

  function draftFor(recruitId) {
    return drafts[recruitId] ?? { score: "", retestScore: "", showRetest: false };
  }

  function setDraftScore(recruitId, score) {
    setDrafts((prev) => ({ ...prev, [recruitId]: { ...draftFor(recruitId), score } }));
  }

  function setDraftRetestScore(recruitId, retestScore) {
    setDrafts((prev) => ({ ...prev, [recruitId]: { ...draftFor(recruitId), retestScore } }));
  }

  function revealRetest(recruitId) {
    setDrafts((prev) => ({ ...prev, [recruitId]: { ...draftFor(recruitId), showRetest: true } }));
  }

  function beginEditOriginal(recruit, currentScore) {
    setDrafts((prev) => ({ ...prev, [recruit.id]: { ...draftFor(recruit.id), score: String(currentScore) } }));
  }

  function beginEditRetake(recruit, currentScore) {
    setDrafts((prev) => ({ ...prev, [recruit.id]: { ...draftFor(recruit.id), retestScore: String(currentScore) } }));
  }

  const hasInvalidScore = recruits.some((r) => {
    const d = draftFor(r.id);
    return !isValidScore(d.score) || !isValidScore(d.retestScore);
  });

  async function handleSaveAll() {
    setSaving(true);
    const errors = {};
    for (const recruit of recruits) {
      const d = draftFor(recruit.id);
      const existing = grades.get(recruit.id);

      if (d.score !== "" && d.score != null) {
        const score = Number(d.score);
        try {
          if (existing?.original) {
            const lineResultId = await getSingleLineResultId(existing.original.id);
            await updateExamScore({ sessionId: existing.original.id, lineResultId, score });
          } else {
            await recordExamScore({
              template,
              recruit,
              evaluatorName: adminDoc.displayName,
              score,
              examDate,
              attemptType: "first",
            });
          }
        } catch (err) {
          console.error("Failed to save exam score", recruit.id, err);
          errors[recruit.id] = "Failed to save — try again.";
        }
      }

      if (d.retestScore !== "" && d.retestScore != null) {
        const retestScore = Number(d.retestScore);
        try {
          if (existing?.retake) {
            const lineResultId = await getSingleLineResultId(existing.retake.id);
            await updateExamScore({ sessionId: existing.retake.id, lineResultId, score: retestScore });
          } else {
            await recordExamScore({
              template,
              recruit,
              evaluatorName: adminDoc.displayName,
              score: retestScore,
              examDate,
              attemptType: "retake",
            });
          }
        } catch (err) {
          console.error("Failed to save exam retest score", recruit.id, err);
          errors[recruit.id] = "Failed to save retest — try again.";
        }
      }
    }
    setRowErrors(errors);
    const refreshed = await loadExamGrades(templateId);
    setGrades(refreshed);
    setDrafts({});
    setSaving(false);
  }

  if (!template) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="app-shell">
      <TopBar title={template.name} onBack={() => navigate("/exam-scores")} showMenu={false} />
      <div className="screen--wide">
        {recruits.length === 0 && <p className="muted">No active recruits in this cohort.</p>}
        <div className="recruit-grid">
          {recruits.map((recruit) => {
            const existing = grades.get(recruit.id);
            const d = draftFor(recruit.id);
            const rowError = rowErrors[recruit.id];
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

                {existing?.original ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`badge ${existing.original.overallResult === RESULT.PASS ? "pass" : "fail"}`}>
                        {existing.original.totalPointsEarned} —{" "}
                        {existing.original.overallResult === RESULT.PASS ? "PASS" : "FAIL"}
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        style={{ width: "auto", padding: "2px 8px", fontSize: 12 }}
                        onClick={() => beginEditOriginal(recruit, existing.original.totalPointsEarned)}
                      >
                        Edit
                      </button>
                    </div>
                    {d.score !== "" && (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={d.score}
                        onChange={(e) => setDraftScore(recruit.id, e.target.value)}
                        style={{ marginTop: 6 }}
                      />
                    )}

                    {existing.retake ? (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            className={`badge ${existing.retake.overallResult === RESULT.PASS ? "pass" : "fail"}`}
                          >
                            Retest {existing.retake.totalPointsEarned} —{" "}
                            {existing.retake.overallResult === RESULT.PASS ? "PASS" : "FAIL"}
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            style={{ width: "auto", padding: "2px 8px", fontSize: 12 }}
                            onClick={() => beginEditRetake(recruit, existing.retake.totalPointsEarned)}
                          >
                            Edit
                          </button>
                        </div>
                        {d.retestScore !== "" && (
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={d.retestScore}
                            onChange={(e) => setDraftRetestScore(recruit.id, e.target.value)}
                            style={{ marginTop: 6 }}
                          />
                        )}
                      </div>
                    ) : d.showRetest ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="Retest score"
                        value={d.retestScore}
                        onChange={(e) => setDraftRetestScore(recruit.id, e.target.value)}
                        style={{ marginTop: 6 }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        style={{ width: "auto", marginTop: 6, fontSize: 12, padding: "4px 10px" }}
                        onClick={() => revealRetest(recruit.id)}
                      >
                        Enter Retest
                      </button>
                    )}
                  </div>
                ) : (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="Score (0-100)"
                    value={d.score}
                    onChange={(e) => setDraftScore(recruit.id, e.target.value)}
                    style={{ marginTop: 10 }}
                  />
                )}
                {rowError && <p style={{ color: "var(--brand-red)", fontSize: 12, marginTop: 4 }}>{rowError}</p>}
              </div>
            );
          })}
        </div>

        <button className="primary" style={{ marginTop: 20 }} disabled={saving || hasInvalidScore} onClick={handleSaveAll}>
          {saving ? "Saving…" : "Save All"}
        </button>
      </div>
    </div>
  );
}
