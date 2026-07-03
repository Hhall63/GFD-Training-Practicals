import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import { buildResultsCsv, downloadCsv } from "../../lib/csv";

export default function ExportPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [recruitsById, setRecruitsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [cohortFilter, setCohortFilter] = useState("All Cohorts");
  const [templateFilter, setTemplateFilter] = useState("All Tests");
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    async function load() {
      const [sessionsSnap, recruitsSnap] = await Promise.all([
        getDocs(query(collection(db, "sessions"), orderBy("startedAt", "desc"))),
        getDocs(collection(db, "recruits")),
      ]);
      const recruitMap = {};
      recruitsSnap.docs.forEach((d) => (recruitMap[d.id] = d.data()));
      setRecruitsById(recruitMap);
      setSessions(
        sessionsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((s) => s.status === "completed")
      );
      setLoading(false);
    }
    load();
  }, []);

  const cohorts = useMemo(
    () => ["All Cohorts", ...new Set(sessions.map((s) => recruitsById[s.recruitId]?.recruitClassOrCohort).filter(Boolean))],
    [sessions, recruitsById]
  );
  const templateNames = useMemo(
    () => ["All Tests", ...new Set(sessions.map((s) => s.templateName))],
    [sessions]
  );

  const filtered = sessions.filter((s) => {
    const cohort = recruitsById[s.recruitId]?.recruitClassOrCohort;
    return (cohortFilter === "All Cohorts" || cohort === cohortFilter)
      && (templateFilter === "All Tests" || s.templateName === templateFilter);
  });

  async function handleExport() {
    setPreparing(true);
    try {
      const withLineResults = await Promise.all(
        filtered.map(async (session) => {
          const lineResultsSnap = await getDocs(
            query(collection(db, "sessions", session.id, "lineResults"), orderBy("sortOrder"))
          );
          return {
            ...session,
            recruitCohort: recruitsById[session.recruitId]?.recruitClassOrCohort,
            recruitBadge: recruitsById[session.recruitId]?.badgeOrIdNumber,
            lineResults: lineResultsSnap.docs.map((d) => d.data()),
          };
        })
      );
      downloadCsv(buildResultsCsv(withLineResults));
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar title="Export to Excel" onBack={() => navigate("/reports")} showMenu={false} />
      <div className="screen">
        {loading ? (
          <p className="muted">Loading sessions…</p>
        ) : (
          <>
            <div className="field">
              <label>Cohort</label>
              <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}>
                {cohorts.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Test</label>
              <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
                {templateNames.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <p className="muted">{filtered.length} session{filtered.length === 1 ? "" : "s"} will be exported.</p>
            <button className="primary" disabled={filtered.length === 0 || preparing} onClick={handleExport}>
              {preparing ? "Preparing…" : "Download CSV (opens in Excel)"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
