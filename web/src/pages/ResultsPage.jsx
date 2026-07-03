import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { formatSeconds, RESULT } from "../lib/constants";

export default function ResultsPage() {
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

  const passed = session.overallResult === RESULT.PASS;

  return (
    <div className="app-shell">
      <div className="screen center-column" style={{ paddingTop: 32 }}>
        <div style={{ fontSize: 56 }}>{passed ? "✅" : "❌"}</div>
        <h1 style={{ color: passed ? "var(--success)" : "var(--brand-red)", margin: "4px 0" }}>
          {passed ? "PASS" : "FAIL"}
        </h1>
        <p style={{ fontWeight: 600, fontSize: 18, margin: "8px 0 2px" }}>{session.recruitName}</p>
        <p className="muted" style={{ margin: 0 }}>{session.templateName}</p>

        <div style={{ width: "100%", marginTop: 24 }}>
          {lineResults.map((line) => (
            <div key={line.id} className="card" style={{ textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{line.lineTextSnapshot}</span>
                <span>
                  {line.result === RESULT.PASS && "✅"}
                  {line.result === RESULT.FAIL && "❌"}
                  {line.result === RESULT.NOT_APPLICABLE && "—"}
                </span>
              </div>
              {line.timerElapsedSeconds != null && (
                <div className="muted">{formatSeconds(line.timerElapsedSeconds)}s</div>
              )}
              {line.photoURLs?.length > 0 && (
                <div className="muted">{line.photoURLs.length} photo(s) attached</div>
              )}
            </div>
          ))}
        </div>

        <button className="primary" style={{ marginTop: 16, maxWidth: 320 }} onClick={() => navigate("/")}>
          Return to Home
        </button>
      </div>
    </div>
  );
}
