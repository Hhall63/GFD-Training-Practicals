import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";

export default function CohortDashboardPage() {
  const { cohort } = useParams();
  const decodedCohort = decodeURIComponent(cohort);
  const navigate = useNavigate();

  const [recruits, setRecruits] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [latestResults, setLatestResults] = useState({}); // `${recruitId}_${templateId}` -> "pass"|"fail"
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [recruitsSnap, templatesSnap] = await Promise.all([
        getDocs(query(collection(db, "recruits"), where("recruitClassOrCohort", "==", decodedCohort), where("isActive", "==", true))),
        getDocs(query(collection(db, "templates"), where("isActive", "==", true))),
      ]);
      const recruitsList = recruitsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const templatesList = templatesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRecruits(recruitsList);
      setTemplates(templatesList);

      if (recruitsList.length > 0) {
        const sessionsSnap = await getDocs(
          query(
            collection(db, "sessions"),
            where("recruitId", "in", recruitsList.slice(0, 30).map((r) => r.id)),
            where("status", "==", "completed")
          )
        );
        const map = {};
        sessionsSnap.docs.forEach((d) => {
          const s = d.data();
          // Later sessions overwrite earlier ones in iteration order isn't guaranteed, so
          // only keep the most recently started one per recruit/template pair.
          const key = `${s.recruitId}_${s.templateId}`;
          const existing = map[key];
          const startedAtMs = s.startedAt?.toMillis?.() ?? 0;
          if (!existing || startedAtMs > existing.startedAtMs) {
            map[key] = { result: s.overallResult, startedAtMs };
          }
        });
        setLatestResults(map);
      }
      setLoading(false);
    }
    load();
  }, [decodedCohort]);

  const completedSessions = Object.values(latestResults);
  const overallPassRate = completedSessions.length
    ? completedSessions.filter((s) => s.result === "pass").length / completedSessions.length
    : null;

  return (
    <div className="app-shell">
      <TopBar title={decodedCohort} onBack={() => navigate("/reports/cohorts")} showMenu={false} />
      <div className="screen">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Recruits</span><strong>{recruits.length}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Overall Pass Rate</span>
                <strong>{overallPassRate == null ? "—" : `${Math.round(overallPassRate * 100)}%`}</strong>
              </div>
            </div>

            <h4>Training Matrix</h4>
            {recruits.map((recruit) => (
              <div key={recruit.id} className="card">
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{recruit.firstName} {recruit.lastName}</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                  {templates.map((template) => {
                    const entry = latestResults[`${recruit.id}_${template.id}`];
                    const label = !entry ? "Not Tested" : entry.result === "pass" ? "Pass" : "Fail";
                    const color = !entry ? "var(--text-secondary)" : entry.result === "pass" ? "var(--success)" : "var(--brand-red)";
                    return (
                      <div
                        key={template.id}
                        style={{
                          minWidth: 90,
                          padding: 8,
                          borderRadius: 8,
                          background: "var(--bg)",
                          textAlign: "center",
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ fontSize: 11 }}>{template.name}</div>
                        <div style={{ fontWeight: 600, color, fontSize: 13 }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
