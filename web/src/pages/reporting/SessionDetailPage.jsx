import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import { formatSeconds, LINE_TYPES, RESULT } from "../../lib/constants";
import { sanitizeHtml } from "../../lib/richText";
import ObstacleCourseSummary from "../../components/ObstacleCourseSummary";

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
          {session.criticalFailure && (
            <div style={{ color: "var(--brand-red)", fontWeight: 700 }}>Critical step failed — automatic failure</div>
          )}
          {session.attemptType === "retake" && <span className="badge neutral">Retake</span>}
          <div style={{ fontWeight: 600 }}>{session.recruitName}</div>
          <div className="muted">
            {session.templateName} ·{" "}
            {session.startedAt?.toDate?.().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) ?? ""}
          </div>
          <div className="muted">Evaluator: {session.evaluatorName}</div>
          {session.totalPointsPossible > 0 && (
            <div style={{ fontWeight: 600, marginTop: 6 }}>
              {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
              {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% — needed{" "}
              {session.passingPercentageSnapshot}% to pass)
            </div>
          )}
        </div>

        {lineResults.map((line) => {
          // The obstacle course's own summary already shows time/deductions/score, so skip
          // the duplicate generic title/time/points header for that step.
          const isObstacle = line.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE;
          return (
            <div key={line.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {!isObstacle && (
                    <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(line.lineTextSnapshot) }} />
                  )}
                </span>
                <span>
                  {line.result === RESULT.PASS && "✅"}
                  {line.result === RESULT.FAIL && "❌"}
                  {line.result === RESULT.NOT_APPLICABLE && "—"}
                </span>
              </div>
              {!isObstacle && (line.timerElapsedSeconds ?? line.elapsedSeconds) != null && (
                <div className="muted">{formatSeconds(line.timerElapsedSeconds ?? line.elapsedSeconds)}s</div>
              )}
              {!isObstacle && line.pointsSnapshot != null && (
                <div className="muted">{line.pointsEarned ?? 0} / {line.pointsSnapshot} pts</div>
              )}
              {line.totalPausedSeconds > 0 && (
                <div className="muted">Paused for {formatSeconds(line.totalPausedSeconds)}s</div>
              )}
              {(line.photoURLs ?? []).map((url) => (
                <img key={url} src={url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, marginTop: 6, marginRight: 6 }} />
              ))}
              {line.note && <div className="muted" style={{ marginTop: 4 }}>{line.note}</div>}
              {isObstacle && (
                <ObstacleCourseSummary config={line.obstacleCourseConfigSnapshot} tallies={line.obstacleTallies} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
