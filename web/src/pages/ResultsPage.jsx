import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { buildFailureMailto, fetchNotifyRecipients } from "../lib/notify";
import { formatSeconds, RESULT } from "../lib/constants";

export default function ResultsPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [lineResults, setLineResults] = useState([]);
  const [mailtoHref, setMailtoHref] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "sessions", sessionId)).then((snap) => setSession({ id: snap.id, ...snap.data() }));
    getDocs(query(collection(db, "sessions", sessionId, "lineResults"), orderBy("sortOrder"))).then((snap) =>
      setLineResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [sessionId]);

  // For failed tests where the automatic email didn't go out, prepare a prefilled
  // compose link to the notify-list admins as a zero-setup fallback.
  useEffect(() => {
    if (!session || session.overallResult !== RESULT.FAIL || lineResults.length === 0) return;
    if (session.failureEmailStatus?.startsWith("sent")) return;
    fetchNotifyRecipients()
      .then((recipients) => {
        if (recipients.length > 0) setMailtoHref(buildFailureMailto(recipients, session, lineResults));
      })
      .catch(() => {});
  }, [session, lineResults]);

  if (!session) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  const passed = session.overallResult === RESULT.PASS;
  const emailStatus = session.failureEmailStatus;

  return (
    <div className="app-shell">
      <div className="screen center-column" style={{ paddingTop: 32 }}>
        <div style={{ fontSize: 56 }}>{passed ? "✅" : "❌"}</div>
        <h1 style={{ color: passed ? "var(--success)" : "var(--brand-red)", margin: "4px 0" }}>
          {passed ? "PASS" : "FAIL"}
        </h1>
        {session.criticalFailure && (
          <p style={{ color: "var(--brand-red)", fontWeight: 700, margin: "0 0 4px" }}>
            Critical step failed — automatic test failure
          </p>
        )}
        {session.attemptType === "retake" && (
          <span className="badge neutral" style={{ marginBottom: 4 }}>Retake</span>
        )}
        <p style={{ fontWeight: 600, fontSize: 18, margin: "8px 0 2px" }}>{session.recruitName}</p>
        <p className="muted" style={{ margin: 0 }}>{session.templateName}</p>
        {session.totalPointsPossible > 0 && (
          <p style={{ fontWeight: 600, marginTop: 8 }}>
            {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points (
            {Math.round(((session.totalPointsEarned ?? 0) / session.totalPointsPossible) * 100)}% —
            needed {session.passingPercentageSnapshot}% to pass)
          </p>
        )}

        {!passed && (
          <div className="card" style={{ width: "100%", maxWidth: 400, marginTop: 8 }}>
            {emailStatus?.startsWith("sent") && (
              <p style={{ margin: 0 }}>
                📧 Failure report emailed to {emailStatus.split(":")[1]} administrator
                {emailStatus.split(":")[1] === "1" ? "" : "s"} automatically.
              </p>
            )}
            {emailStatus === "no-recipients" && (
              <p className="muted" style={{ margin: 0 }}>
                No administrators have "Notify with failures" turned on, so no failure email
                was sent.
              </p>
            )}
            {(emailStatus === "not-configured" || emailStatus === "failed") && (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  {emailStatus === "failed"
                    ? "Automatic email failed to send."
                    : "Automatic email isn't set up yet."}{" "}
                  Send the failure report from your own mail app instead:
                </p>
                {mailtoHref ? (
                  <a href={mailtoHref} className="primary" style={{ display: "block", textAlign: "center", padding: 14, borderRadius: 14, background: "var(--brand-navy)", color: "white", textDecoration: "none", fontWeight: 600 }}>
                    ✉️ Email Failure Report
                  </a>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    (No administrators have "Notify with failures" turned on.)
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ width: "100%", marginTop: 24 }}>
          {lineResults.map((line) => (
            <div key={line.id} className="card" style={{ textAlign: "left" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {line.lineTextSnapshot}
                  {line.isCriticalSnapshot && line.result === RESULT.FAIL && (
                    <span style={{ color: "var(--brand-red)", fontWeight: 700 }}> (CRITICAL)</span>
                  )}
                </span>
                <span>
                  {line.result === RESULT.PASS && "✅"}
                  {line.result === RESULT.FAIL && "❌"}
                  {line.result === RESULT.NOT_APPLICABLE && "—"}
                </span>
              </div>
              {line.timerElapsedSeconds != null && (
                <div className="muted">{formatSeconds(line.timerElapsedSeconds)}s</div>
              )}
              {line.pointsSnapshot != null && (
                <div className="muted">{line.pointsEarned ?? 0} / {line.pointsSnapshot} pts</div>
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
