// web/src/pages/reporting/TranscriptCompletePage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import TranscriptHeader from "../../components/TranscriptHeader";
import TranscriptLineItem from "../../components/TranscriptLineItem";
import { buildTranscriptLineItems } from "../../lib/reportsData";
import { initials } from "../../lib/constants";

export default function TranscriptCompletePage() {
  const { recruitId } = useParams();
  const navigate = useNavigate();
  const [recruit, setRecruit] = useState(null);
  const [lineItems, setLineItems] = useState(null); // { core, remaining }

  useEffect(() => {
    getDoc(doc(db, "recruits", recruitId)).then((snap) => setRecruit({ id: snap.id, ...snap.data() }));
    buildTranscriptLineItems({ recruitId }).then(setLineItems);
  }, [recruitId]);

  if (!recruit || !lineItems) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  const { core, remaining } = lineItems;
  const noResultsAtAll = core.length === 0 && remaining.length === 0;

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

      {noResultsAtAll ? (
        <p className="muted">No completed tests yet.</p>
      ) : (
        <>
          {core.length === 0 ? (
            <p className="muted">No core tests recorded yet.</p>
          ) : (
            core.map((item) => <TranscriptLineItem key={item.templateId} item={item} />)
          )}

          {remaining.length > 0 && (
            <>
              <h3 style={{ marginTop: 20, color: "var(--brand-navy)" }}>Additional Tests &amp; Practicals</h3>
              {remaining.map((item) => (
                <TranscriptLineItem key={item.templateId} item={item} />
              ))}
            </>
          )}
        </>
      )}

      <button className="primary no-print" style={{ marginTop: 24 }} onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
