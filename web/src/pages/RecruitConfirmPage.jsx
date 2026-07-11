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
  // Two routes render this page: /test/:templateId (a single test) and
  // /test/group/:groupId (a Test Group — several templates run back-to-back for one
  // recruit). Only one of these params is ever set, depending on which route matched.
  const { templateId, groupId } = useParams();
  const navigate = useNavigate();
  const { adminDoc, isAdmin } = useAuth();

  const [template, setTemplate] = useState(null);
  const [group, setGroup] = useState(null);
  const [groupTemplateIds, setGroupTemplateIds] = useState(null);
  const [recruits, setRecruits] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [attemptType, setAttemptType] = useState("first");
  const [starting, setStarting] = useState(false);
  const [viewMode, setViewMode] = useState("standard");
  // Whether the selected template contains an obstacle-course line — checked before the test
  // starts (same query beginTest() runs) so the Display View picker can be hidden and defaulted
  // to Standard for these templates, matching the runner's own always-Standard enforcement.
  const [templateHasObstacleCourse, setTemplateHasObstacleCourse] = useState(false);

  useEffect(() => {
    if (groupId) {
      // Load the group, then the first template in its ordered list — the recruit is
      // confirmed once, and "Start" begins that first test exactly like a normal test.
      getDoc(doc(db, "testGroups", groupId)).then(async (snap) => {
        if (!snap.exists()) return;
        const groupData = { id: snap.id, ...snap.data() };
        setGroup(groupData);
        const ids = groupData.templateIds ?? [];
        setGroupTemplateIds(ids);
        if (ids.length > 0) {
          const firstSnap = await getDoc(doc(db, "templates", ids[0]));
          if (firstSnap.exists()) setTemplate({ id: firstSnap.id, ...firstSnap.data() });
        }
      });
    } else {
      getDoc(doc(db, "templates", templateId)).then((snap) => {
        if (snap.exists()) setTemplate({ id: snap.id, ...snap.data() });
      });
    }
  }, [templateId, groupId]);

  // Checked whenever `template` (re)loads — same lines query beginTest() uses — so we know
  // before the test starts whether Checklist/Tile should even be offered. Runs for both flows:
  // a single test's own template, or a group's first template (checking its lines is enough,
  // since RecruitConfirmPage only ever shows the picker once, up front, for the first test).
  useEffect(() => {
    if (!template) return;
    getDocs(query(collection(db, "templates", template.id, "lines"), orderBy("sortOrder"))).then(
      (snap) => {
        const hasOC = snap.docs.some((d) => d.data().lineType === LINE_TYPES.OBSTACLE_COURSE);
        setTemplateHasObstacleCourse(hasOC);
        if (hasOC) setViewMode("standard");
      }
    );
  }, [template]);

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
      // `template` is already the right one for either flow: the single template picked
      // by /test/:templateId, or the first template in the group's ordered list for
      // /test/group/:groupId.
      const linesSnap = await getDocs(
        query(collection(db, "templates", template.id, "lines"), orderBy("sortOrder"))
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
        // Only present when this session was started from a Test Group — snapshot the
        // group name (same "snapshot" convention as passingPercentageSnapshot etc.) so a
        // later rename of the group never rewrites the history of past tests. Sessions
        // started the normal way simply never have these fields.
        ...(groupId ? { groupId, groupName: group?.name ?? null, groupSequenceIndex: 0 } : {}),
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

      navigate(`/session/${sessionRef.id}/run`, { replace: true, state: { initialViewMode: viewMode } });
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
      <TopBar title={groupId && group ? `${group.name} (1 of ${groupTemplateIds?.length ?? 1})` : template.name} showMenu={false} />
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
            <h2 style={{ margin: "0 0 4px" }}>{selected.firstName} {selected.lastName}</h2>
            <p className="muted" style={{ margin: "0 0 4px" }}>{selected.recruitClassOrCohort}</p>
            {selected.badgeOrIdNumber && <p className="muted">ID: {selected.badgeOrIdNumber}</p>}
            <p className="muted" style={{ maxWidth: 320, margin: "16px 0" }}>
              {groupId && group
                ? `Confirm this is the recruit being tested on the "${group.name}" group (starting with "${template.name}", ${groupTemplateIds?.length ?? 1} tests total).`
                : `Confirm this is the recruit being tested on "${template.name}".`}
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
              {!templateHasObstacleCourse && (
                <div className="field" style={{ textAlign: "left" }}>
                  <label>Display View</label>
                  <div className="segmented">
                    {["standard", "checklist", "tile"].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`segment ${viewMode === mode ? "active" : ""}`}
                        onClick={() => setViewMode(mode)}
                      >
                        {mode === "standard" ? "Standard" : mode === "checklist" ? "Checklist" : "Tile"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
