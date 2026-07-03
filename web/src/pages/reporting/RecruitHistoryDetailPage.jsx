import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";
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
    getDocs(
      query(
        collection(db, "sessions"),
        where("recruitId", "==", recruitId),
        where("status", "==", "completed"),
        orderBy("startedAt", "desc")
      )
    ).then((snap) => setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
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
            <div style={{ fontWeight: 600, fontSize: 18 }}>{recruit.firstName} {recruit.lastName}</div>
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
