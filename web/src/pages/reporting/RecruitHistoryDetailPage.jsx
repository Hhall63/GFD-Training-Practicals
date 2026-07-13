import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import { initials } from "../../lib/constants";

export default function RecruitHistoryDetailPage() {
  const { recruitId } = useParams();
  const navigate = useNavigate();
  const [recruit, setRecruit] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    getDoc(doc(db, "recruits", recruitId)).then((snap) => setRecruit({ id: snap.id, ...snap.data() }));
    // Query by recruitId only (a single equality filter needs no composite index), then
    // filter to completed and sort newest-first client-side. A recruit has at most a
    // handful of sessions, so this is cheap — and it avoids the composite index the
    // previous where+where+orderBy query silently failed on.
    getDocs(query(collection(db, "sessions"), where("recruitId", "==", recruitId)))
      .then((snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // Practice sessions (Task 6) are excluded defensively — a real recruit should
          // never have any, but this keeps the page correct even if that ever changes.
          .filter((s) => s.status === "completed" && !s.isPractice)
          .sort((a, b) => (b.startedAt?.toMillis?.() ?? 0) - (a.startedAt?.toMillis?.() ?? 0));
        setSessions(rows);
      })
      .catch((err) => {
        console.error("Failed to load recruit sessions", err);
        setSessions([]);
      });
  }, [recruitId]);

  if (!recruit) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  return (
    <div className="app-shell">
      <TopBar title={`${recruit.firstName} ${recruit.lastName}`} onBack={() => navigate("/reports/recruits")} showMenu={false} />
      <div className="screen">
        <div className="card" style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {recruit.photoURL ? (
            <img src={recruit.photoURL} className="avatar" style={{ width: 64, height: 64 }} alt="" />
          ) : (
            <div className="avatar" style={{ width: 64, height: 64 }}>{initials(recruit.firstName, recruit.lastName)}</div>
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--brand-navy)" }}>{recruit.firstName} {recruit.lastName}</div>
            <div className="muted">{recruit.recruitClassOrCohort}</div>
          </div>
        </div>

        <h4>Sessions</h4>
        {sessions.length === 0 && <p className="muted">No completed tests yet.</p>}
        {sessions.map((session) => (
          <button key={session.id} className="list-row" onClick={() => navigate(`/reports/sessions/${session.id}`)}>
            <div style={{ flex: 1 }}>
              <div>{session.templateName}</div>
              <div className="muted">
                {session.startedAt?.toDate?.().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) ?? ""}
              </div>
            </div>
            <span className={`badge ${session.overallResult === "pass" ? "pass" : "fail"}`}>
              {session.overallResult === "pass" ? "PASS" : "FAIL"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
