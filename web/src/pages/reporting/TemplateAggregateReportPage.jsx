import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import TopBar from "../../components/TopBar";
import { LINE_TYPES, RESULT } from "../../lib/constants";
import { sanitizeHtml } from "../../lib/richText";

export default function TemplateAggregateReportPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [rows, setRows] = useState([]);
  const [passRate, setPassRate] = useState(null);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    async function load() {
      const templateSnap = await getDoc(doc(db, "templates", templateId));
      setTemplate({ id: templateSnap.id, ...templateSnap.data() });

      const sessionsSnap = await getDocs(
        query(collection(db, "sessions"), where("templateId", "==", templateId), where("status", "==", "completed"))
      );
      // Exclude practice sessions (Task 6) — an evaluator may have run this exact test on
      // the practice recruit while training, and that run must never count toward the
      // real pass-rate/step-failure stats.
      const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.isPractice);
      setSessionCount(sessions.length);
      setPassRate(sessions.length ? sessions.filter((s) => s.overallResult === "pass").length / sessions.length : null);

      const counts = new Map(); // text -> { failed, total }
      const order = [];
      for (const session of sessions) {
        const lineResultsSnap = await getDocs(
          query(collection(db, "sessions", session.id, "lineResults"), orderBy("sortOrder"))
        );
        lineResultsSnap.docs.forEach((d) => {
          const line = d.data();
          if (line.lineTypeSnapshot === LINE_TYPES.INSTRUCTION) return;
          const key = line.lineTextSnapshot;
          if (!counts.has(key)) {
            counts.set(key, { failed: 0, total: 0 });
            order.push(key);
          }
          const entry = counts.get(key);
          entry.total += 1;
          if (line.result === RESULT.FAIL) entry.failed += 1;
        });
      }
      setRows(order.map((text) => ({ text, ...counts.get(text) })));
    }
    load();
  }, [templateId]);

  if (!template) return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;

  return (
    <div className="app-shell">
      <TopBar title={template.name} onBack={() => navigate("/reports/templates")} showMenu={false} />
      <div className="screen">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Sessions</span><strong style={{ color: "var(--brand-navy)" }}>{sessionCount}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Overall Pass Rate</span>
            <strong style={{ color: "var(--brand-navy)" }}>{passRate == null ? "—" : `${Math.round(passRate * 100)}%`}</strong>
          </div>
        </div>

        <h4>Failure Rate by Step</h4>
        {rows.length === 0 && <p className="muted">No completed sessions yet.</p>}
        {rows.map((row) => (
          <div key={row.text} className="card">
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.text) }} />
            <div className="muted" style={{ color: row.failed > 0 ? "var(--brand-red)" : undefined }}>
              Failed {row.failed} of {row.total} ({Math.round((row.failed / row.total) * 100)}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
