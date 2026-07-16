// web/src/pages/reporting/ClassReportPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TranscriptHeader from "../../components/TranscriptHeader";
import TranscriptLineItem from "../../components/TranscriptLineItem";
import { buildTranscriptLineItems } from "../../lib/reportsData";

export default function ClassReportPage() {
  const { filterId } = useParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState(null);
  const [recruitReports, setRecruitReports] = useState(null); // [{ recruit, items }]

  useEffect(() => {
    async function load() {
      const filterSnap = await getDoc(doc(db, "classReportFilters", filterId));
      const filterData = { id: filterSnap.id, ...filterSnap.data() };
      setFilter(filterData);

      const recruitsSnap = await getDocs(
        query(
          collection(db, "recruits"),
          where("recruitClassOrCohort", "==", filterData.cohort),
          where("isActive", "==", true)
        )
      );
      const recruits = recruitsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => !r.isPractice)
        .sort((a, b) => a.lastName.localeCompare(b.lastName));

      const reports = await Promise.all(
        recruits.map(async (recruit) => {
          const { items } = await buildTranscriptLineItems({
            recruitId: recruit.id,
            templateIds: filterData.templateIds,
          });
          return { recruit, items };
        })
      );
      setRecruitReports(reports);
    }
    load();
  }, [filterId]);

  if (!filter || !recruitReports) {
    return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
  }

  return (
    <div className="screen">
      <button
        className="secondary no-print"
        style={{ width: "auto", marginBottom: 16 }}
        onClick={() => navigate("/reports/class")}
      >
        ← Back
      </button>

      <TranscriptHeader />
      <h3 style={{ color: "var(--brand-navy)" }}>{filter.name}</h3>

      {recruitReports.length === 0 ? (
        <p className="muted">No active recruits in this cohort.</p>
      ) : (
        recruitReports.map(({ recruit, items }) => (
          <div key={recruit.id} className="class-report-recruit">
            <h4 style={{ color: "var(--brand-navy)" }}>
              {recruit.firstName} {recruit.lastName}
            </h4>
            {items.length === 0 ? (
              <p className="muted">No results yet for the selected tests.</p>
            ) : (
              items.map((item) => <TranscriptLineItem key={item.templateId} item={item} />)
            )}
          </div>
        ))
      )}

      <button className="primary no-print" style={{ marginTop: 24 }} onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}
