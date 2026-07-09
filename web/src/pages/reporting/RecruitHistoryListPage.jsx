import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";

export default function RecruitHistoryListPage() {
  const navigate = useNavigate();
  const [recruits, setRecruits] = useState([]);
  const [sessionsByRecruit, setSessionsByRecruit] = useState({});

  useEffect(() => {
    async function load() {
      const [recruitsSnap, sessionsSnap] = await Promise.all([
        getDocs(query(collection(db, "recruits"), where("isActive", "==", true))),
        getDocs(query(collection(db, "sessions"), where("status", "==", "completed"))),
      ]);
      const recruitsList = recruitsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.lastName.localeCompare(b.lastName));
      const grouped = {};
      sessionsSnap.docs.forEach((d) => {
        const s = d.data();
        (grouped[s.recruitId] ??= []).push(s);
      });
      setRecruits(recruitsList);
      setSessionsByRecruit(grouped);
    }
    load();
  }, []);

  return (
    <div className="app-shell">
      <TopBar title="Recruit History" onBack={() => navigate("/reports")} showMenu={false} />
      <div className="screen">
        {recruits.map((recruit) => {
          const sessions = sessionsByRecruit[recruit.id] ?? [];
          const passCount = sessions.filter((s) => s.overallResult === "pass").length;
          return (
            <button key={recruit.id} className="list-row" onClick={() => navigate(`/reports/recruits/${recruit.id}`)}>
              <div>
                <div style={{ fontWeight: 700, color: "var(--brand-navy)" }}>{recruit.firstName} {recruit.lastName}</div>
                <div className="muted">
                  {sessions.length === 0
                    ? "No completed tests yet"
                    : `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${passCount} pass, ${sessions.length - passCount} fail`}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
