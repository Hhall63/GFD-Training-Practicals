import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import { formatSeconds, RESULT } from "../../lib/constants";

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [lineResults, setLineResults] = useState([]);

  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSession({ id: snap.id, ...snap.data() }));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then((snap) =>
      setLineResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [sessionId]);

  if (!session) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  return (
    <div className="app-shell">
      <TopBar title="Session Detail" onBack={() => navigate(-1)} showMenu={false} />
      <div className="screen">
        <div className="card center-column">
          <h2 style={{ margin: "0 0 4px", color: session.overallResult === "pass" ? "var(--success)" : "var(--brand-red)" }}>
            {session.overallResult === "pass" ? "PASS" : "FAIL"}
          </h2>
          <div style={{ fontWeight: 600 }}>{session.recruitName}</div>
          <div className="muted">
            {session.templateName} ·{" "}
            {session.startedAt?.toDate?.().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) ?? ""}
          </div>
          <div className="muted">Evaluator: {session.evaluatorName}</div>
        </div>

        {lineResults.map((line) => (
          <div key={line.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{line.lineTextSnapshot}</span>
              <span>
                {line.result === RESULT.PASS && "✅"}
                {line.result === RESULT.FAIL && "❌"}
                {line.result === RESULT.NOT_APPLICABLE && "—"}
              </span>
            </div>
            {line.timerElapsedSeconds != null && <div className="muted">{formatSeconds(line.timerElapsedSeconds)}s</div>}
            {(line.photoURLs ?? []).map((url) => (
              <img key={url} src={url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, marginTop: 6, marginRight: 6 }} />
            ))}
            {line.note && <div className="muted" style={{ marginTop: 4 }}>{line.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
