import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import TopBar from "../components/TopBar";
import { RESULT } from "../lib/constants";

// A convenience index over the N independent, already-existing session results that make up
// one recruit's run through a Test Group — nothing here computes or shows a combined score.
export default function GroupSummaryPage() {
  const { groupId, recruitId } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);

  useEffect(() => {
    // Two equality filters, sorted client-side by groupSequenceIndex rather than via an
    // `orderBy` in the query — this project keeps firestore.indexes.json empty and avoids
    // composite indexes elsewhere (see TemplateAggregateReportPage) by sorting in memory.
    getDocs(
      query(collection(db, "sessions"), where("groupId", "==", groupId), where("recruitId", "==", recruitId))
    ).then((snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.groupSequenceIndex ?? 0) - (b.groupSequenceIndex ?? 0));
      setSessions(rows);
    });
  }, [groupId, recruitId]);

  if (!sessions) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  const groupName = sessions[0]?.groupName ?? "Test Group Results";
  const recruitName = sessions[0]?.recruitName ?? "";

  return (
    <div className="app-shell">
      <TopBar title={groupName} onBack={() => navigate("/")} showMenu={false} />
      <div className="screen">
        {recruitName && <p style={{ fontWeight: 600, marginBottom: 0 }}>{recruitName}</p>}
        <p className="muted" style={{ marginTop: 4 }}>
          Each test below is scored independently against its own passing score — there is no
          combined score for the group.
        </p>
        {sessions.length === 0 && (
          <p className="muted">No sessions found yet for this group and recruit.</p>
        )}
        {sessions.map((session) => {
          const inProgress = session.overallResult == null;
          const passed = session.overallResult === RESULT.PASS;
          return (
            <button
              key={session.id}
              className="list-row"
              disabled={inProgress}
              onClick={() => navigate(`/session/${session.id}/results`)}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{session.templateName}</div>
                {session.totalPointsPossible > 0 && (
                  <div className="muted">
                    {session.totalPointsEarned ?? 0} / {session.totalPointsPossible} points
                  </div>
                )}
              </div>
              {inProgress ? (
                <span className="badge neutral">In Progress</span>
              ) : (
                <span className={`badge ${passed ? "pass" : "fail"}`}>{passed ? "PASS" : "FAIL"}</span>
              )}
            </button>
          );
        })}

        <button className="secondary" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
          Return to Home
        </button>
      </div>
    </div>
  );
}
