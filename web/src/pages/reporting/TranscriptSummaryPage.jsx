// web/src/pages/reporting/TranscriptSummaryPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import TranscriptHeader from "../../components/TranscriptHeader";
import TranscriptLineItem from "../../components/TranscriptLineItem";
import { buildTranscriptLineItems } from "../../lib/reportsData";
import { initials } from "../../lib/constants";

export default function TranscriptSummaryPage() {
  const { recruitId } = useParams();
  const navigate = useNavigate();
  const [recruit, setRecruit] = useState(null);
  const [core, setCore] = useState(null);

  useEffect(() => {
    getDoc(doc(db, "recruits", recruitId)).then((snap) => setRecruit({ id: snap.id, ...snap.data() }));
    buildTranscriptLineItems({ recruitId }).then((r) => setCore(r.core));
  }, [recruitId]);

  if (!recruit || !core) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="screen">
      <button
        className="secondary no-print"
        style={{ width: "auto", marginBottom: 16 }}
        onClick={() => navigate(`/reports/recruits/${recruitId}`)}
      >
        ← Back
      </button>

      <TranscriptHeader />

      <div className="transcript-recruit-block">
        {recruit.photoURL ? (
          <img src={recruit.photoURL} className="avatar transcript-photo" alt="" />
        ) : (
          <div className="avatar transcript-photo">{initials(recruit.firstName, recruit.lastName)}</div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: "var(--brand-navy)" }}>
            {recruit.firstName} {recruit.lastName}
          </div>
          <div className="muted">{recruit.recruitClassOrCohort}</div>
          {recruit.badgeOrIdNumber && <div className="muted">Badge/ID: {recruit.badgeOrIdNumber}</div>}
        </div>
      </div>

      {core.length === 0 ? (
        <p className="muted">No core tests recorded yet.</p>
      ) : (
        core.map((item) => <TranscriptLineItem key={item.templateId} item={item} />)
      )}

      <button className="primary no-print" style={{ marginTop: 24 }} onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
