// web/src/pages/ExamScoresPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";

function todayDateInputValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function ExamScoresPage() {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [examDate, setExamDate] = useState(todayDateInputValue());
  const [cohorts, setCohorts] = useState(["All"]);
  const [cohort, setCohort] = useState("All");

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

  useEffect(() => {
    getDocs(query(collection(db, "recruits"), where("isActive", "==", true))).then((snap) => {
      const set = new Set(
        snap.docs
          .map((d) => d.data())
          .filter((r) => !r.isPractice)
          .map((r) => r.recruitClassOrCohort)
          .filter(Boolean)
      );
      setCohorts(["All", ...[...set].sort()]);
    });
  }, []);

  return (
    <div className="app-shell">
      <TopBar title="Enter Exam Scores" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        <div className="field">
          <label>Exam</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select an exam…</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.examCategory ? `${e.examCategory} — ${e.name}` : e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Exam Given On</label>
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
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
        <button
          className="primary"
          disabled={!selectedId || !examDate}
          onClick={() =>
            navigate(`/exam-scores/${selectedId}?date=${examDate}&cohort=${encodeURIComponent(cohort)}`)
          }
        >
          Start Grading
        </button>
      </div>
    </div>
  );
}
