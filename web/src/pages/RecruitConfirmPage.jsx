import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/TopBar";
import { initials, LINE_TYPES, RESULT, SESSION_STATUS } from "../lib/constants";
import { defaultObstacleCourseConfig, seedObstacleTallies } from "../lib/obstacleCourse";

export default function RecruitConfirmPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { adminDoc, isAdmin } = useAuth();

  const [template, setTemplate] = useState(null);
  const [recruits, setRecruits] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [attemptType, setAttemptType] = useState("first");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getDoc(doc(db, "templates", templateId)).then((snap) => {
      if (snap.exists()) setTemplate({ id: snap.id, ...snap.data() });
    });
  }, [templateId]);

  useEffect(() => {
    const q = query(collection(db, "recruits"), where("isActive", "==", true));
    return onSnapshot(q, (snap) => {
      setRecruits(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.lastName.localeCompare(b.lastName))
      );
    });
  }, []);

  const filtered = useMemo(() => {
    if (!search) return recruits;
    const s = search.toLowerCase();
    return recruits.filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase().includes(s));
  }, [recruits, search]);

  async function beginTest() {
    setStarting(true);
    try {
      const linesSnap = await getDocs(
        query(collection(db, "templates", templateId, "lines"), orderBy("sortOrder"))
      );
      const lines = linesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Snapshot the template's scoring rules onto the session at start time, so editing
      // the template later (points, passing %) never rewrites the history of past tests.
      const totalPointsPossible = lines.reduce(
        (sum, line) => sum + (line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : 0),
        0
      );

      const sessionRef = await addDoc(collection(db, "sessions"), {
        recruitId: selected.id,
        recruitName: `${selected.firstName} ${selected.lastName}`,
        templateId: template.id,
        templateName: template.name,
        evaluatorName: adminDoc.displayName,
        attemptType, // "first" | "retake" (retake is admin-only, enforced in the UI below)
        startedAt: serverTimestamp(),
        completedAt: null,
        status: SESSION_STATUS.IN_PROGRESS,
        overallResult: null,
        criticalFailure: false,
        passingPercentageSnapshot: template.passingPercentage ?? 70,
        totalPointsPossible,
        totalPointsEarned: null,
        failureEmailStatus: null,
      });

      const batch = writeBatch(db);
      lines.forEach((line) => {
        const lineResultRef = doc(collection(db, "sessions", sessionRef.id, "lineResults"));
        const isObstacleCourse = line.lineType === LINE_TYPES.OBSTACLE_COURSE;
        batch.set(lineResultRef, {
          sortOrder: line.sortOrder,
          lineTypeSnapshot: line.lineType,
          lineTextSnapshot: line.lineText,
          passThresholdSecondsSnapshot: line.passThresholdSeconds ?? null,
          pointsSnapshot: line.lineType !== LINE_TYPES.INSTRUCTION ? Number(line.points ?? 0) : null,
          isCriticalSnapshot: line.isCritical ?? false,
          // The course is a fixed department form, so snapshot the baked-in scoring rules
          // rather than anything stored on the template line.
          obstacleCourseConfigSnapshot: isObstacleCourse ? defaultObstacleCourseConfig() : null,
          obstacleTallies: isObstacleCourse ? seedObstacleTallies() : null,
          result: line.lineType === LINE_TYPES.INSTRUCTION ? RESULT.NOT_APPLICABLE : null,
          pointsEarned: null,
          timerElapsedSeconds: null,
          note: null,
          photoURLs: [],
        });
      });
      await batch.commit();

      navigate(`/session/${sessionRef.id}/run`, { replace: true });
    } finally {
      setStarting(false);
    }
  }

  if (!template) {
    return (
      <div className="app-shell">
        <TopBar title="Loading…" showMenu={false} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar title={template.name} showMenu={false} />
      <div className="screen">
        {!selected ? (
          <>
            <button className="secondary" style={{ marginBottom: 12, maxWidth: 200 }} onClick={() => navigate("/")}>
              Return to Home
            </button>
            <div className="field">
              <input
                type="text"
                placeholder="Search recruits"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {filtered.length === 0 && (
              <p className="muted">No recruits yet. Add recruits from the menu under Manage Recruits.</p>
            )}
            {filtered.map((recruit) => (
              <button key={recruit.id} className="list-row" onClick={() => setSelected(recruit)}>
                {recruit.photoURL ? (
                  <img src={recruit.photoURL} className="avatar" alt="" />
                ) : (
                  <div className="avatar">{initials(recruit.firstName, recruit.lastName)}</div>
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{recruit.firstName} {recruit.lastName}</div>
                  <div className="muted">{recruit.recruitClassOrCohort}</div>
                </div>
              </button>
            ))}
          </>
        ) : (
          <div className="center-column" style={{ paddingTop: 24 }}>
            {selected.photoURL ? (
              <img src={selected.photoURL} alt="" style={{ width: 180, height: 180, borderRadius: "50%", objectFit: "cover", marginBottom: 16 }} />
            ) : (
              <div className="avatar" style={{ width: 180, height: 180, fontSize: 48, marginBottom: 16 }}>
                {initials(selected.firstName, selected.lastName)}
              </div>
            )}
            <h2 style={{ margin: "0 0 4px", color: "var(--brand-navy)" }}>{selected.firstName} {selected.lastName}</h2>
            <p className="muted" style={{ margin: "0 0 4px" }}>{selected.recruitClassOrCohort}</p>
            {selected.badgeOrIdNumber && <p className="muted">ID: {selected.badgeOrIdNumber}</p>}
            <p className="muted" style={{ maxWidth: 320, margin: "16px 0" }}>
              Confirm this is the recruit being tested on "{template.name}".
            </p>
            <div style={{ width: "100%", maxWidth: 320 }}>
              <div className="field" style={{ textAlign: "left" }}>
                <label>Attempt</label>
                <select value={attemptType} onChange={(e) => setAttemptType(e.target.value)}>
                  <option value="first">1st Attempt</option>
                  {/* Retakes are only administrators' call — evaluators don't see the option. */}
                  {isAdmin && <option value="retake">Retake</option>}
                </select>
              </div>
              <button className="primary" onClick={beginTest} disabled={starting}>
                {starting ? "Starting…" : attemptType === "retake" ? "Begin Retake" : "Begin Test"}
              </button>
              <button className="secondary" style={{ marginTop: 10 }} onClick={() => setSelected(null)}>
                Choose a Different Recruit
              </button>
              <button className="secondary" style={{ marginTop: 10 }} onClick={() => navigate("/")}>
                Return to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
