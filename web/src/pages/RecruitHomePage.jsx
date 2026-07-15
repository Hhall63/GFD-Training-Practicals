import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { RESULT, SESSION_STATUS } from "../lib/constants";
import { resolveEffectiveSession } from "../lib/reportsData";

/**
 * What a signed-in Recruit sees: every published test, each tagged with their own status —
 * Not attempted / Passed / Failed / Retake-pass / Retake-fail. Read-only; recruits cannot
 * run tests or see anyone else's results (enforced by the security rules too).
 */
export default function RecruitHomePage() {
  const { adminDoc } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The rules only permit recruits to read published tests, so the filter must be part
    // of the query.
    const q = query(
      collection(db, "templates"),
      where("isActive", "==", true),
      where("status", "==", "published")
    );
    return onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name))
      );
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!adminDoc?.recruitId) return;
    // Likewise: recruits may only query their own sessions.
    const q = query(collection(db, "sessions"), where("recruitId", "==", adminDoc.recruitId));
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [adminDoc?.recruitId]);

  const statusByTemplate = useMemo(() => {
    const map = {};
    for (const template of templates) {
      const completed = sessions.filter(
        (s) => s.templateId === template.id && s.status === SESSION_STATUS.COMPLETED
      );
      const { original, retake } = resolveEffectiveSession(completed);

      if (retake) {
        map[template.id] = retake.overallResult === RESULT.PASS
          ? { label: "Retake — Pass", tone: "pass" }
          : { label: "Retake — Fail", tone: "fail" };
      } else if (original) {
        map[template.id] = original.overallResult === RESULT.PASS
          ? { label: "Passed", tone: "pass" }
          : { label: "Failed", tone: "fail" };
      } else {
        map[template.id] = { label: "Not attempted", tone: "neutral" };
      }
    }
    return map;
  }, [templates, sessions]);

  return (
    <div className="app-shell">
      <TopBar title="My Tests" />
      <div className="screen">
        <h3 style={{ marginTop: 16 }}>Your Test Status</h3>
        <p className="muted" style={{ marginTop: -8 }}>
          Tests are run with an evaluator — this list shows where you stand on each one.
        </p>
        {!loading && templates.length === 0 && <p className="muted">No tests published yet.</p>}
        {templates.map((template) => {
          const status = statusByTemplate[template.id];
          const cardModifier = status.tone === "pass" ? " card--pass" : status.tone === "fail" ? " card--fail" : "";
          return (
            <div key={template.id} className={`card${cardModifier}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{template.name}</div>
                  {template.description && <div className="muted">{template.description}</div>}
                </div>
                <span className={`badge ${status.tone}`} style={{ flexShrink: 0 }}>{status.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
