import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../../components/TopBar";
import { buildCommandBoard, clearAllSessions, loadCommandBoardData } from "../../lib/reportsData";
import { RESULT } from "../../lib/constants";

const QUICK_LINKS = [
  ["Recruit History", "Full session history per recruit", "/reports/recruits"],
  ["Test Pass Rates", "Failure rate by step, per test", "/reports/templates"],
  ["Cohort Dashboard", "Training matrix by cohort", "/reports/cohorts"],
  ["Export to Excel", "Download raw results as CSV", "/reports/export"],
];

function KpiTile({ label, value, alert }) {
  return (
    <div className="card card--raised kpi-tile">
      <span className="eyebrow">{label}</span>
      <span className="kpi-accent" aria-hidden="true" />
      <span className={`kpi-value${alert ? " kpi-value--alert" : ""}`}>{value}</span>
    </div>
  );
}

function ClearAllResultsModal({ onClose, onCleared }) {
  const [confirmText, setConfirmText] = useState("");
  const [clearing, setClearing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  const canConfirm = confirmText.trim() === "CLEAR" && !clearing;

  async function handleConfirm() {
    setClearing(true);
    setError("");
    try {
      await clearAllSessions((done, total) => setProgress({ done, total }));
      await onCleared();
    } catch (err) {
      setError("Something went wrong while clearing results. Please try again.");
      setClearing(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}
      onClick={clearing ? undefined : onClose}
    >
      <div className="card" style={{ width: 340, background: "white" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Clear All Results</h3>
        <p className="muted">
          This permanently deletes all test results for every recruit. Recruits and test
          templates are not affected. This cannot be undone.
        </p>
        {clearing ? (
          <p className="muted">
            Deleting… {progress.done} of {progress.total} sessions
          </p>
        ) : (
          <>
            <div className="field">
              <label>Type CLEAR to confirm</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>
            {error && <p style={{ color: "var(--brand-red)", fontSize: 13 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary"
                style={{ background: "var(--brand-red)" }}
                disabled={!canConfirm}
                onClick={handleConfirm}
              >
                Delete Everything
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ReportingHomePage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cohortFilter, setCohortFilter] = useState("All Cohorts");
  const [showClearModal, setShowClearModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCommandBoardData().then((raw) => {
      if (!cancelled) {
        setData(raw);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const board = useMemo(() => (data ? buildCommandBoard(data) : null), [data]);

  const cohorts = useMemo(() => {
    if (!data) return ["All Cohorts"];
    const set = new Set(data.recruits.map((r) => r.recruitClassOrCohort).filter(Boolean));
    return ["All Cohorts", ...[...set].sort()];
  }, [data]);

  if (loading || !board) {
    return (
      <div className="app-shell">
        <TopBar title="Reports" onBack={() => navigate("/")} showMenu={false} />
        <div className="screen--wide">
          <p className="muted">Loading command board…</p>
        </div>
      </div>
    );
  }

  const { kpis, flagged, matrix } = board;
  const noRecruits = data.recruits.length === 0;
  const matrixRecruits =
    cohortFilter === "All Cohorts"
      ? matrix.recruits
      : matrix.recruits.filter((r) => r.recruitClassOrCohort === cohortFilter);

  return (
    <div className="app-shell">
      <TopBar title="Reports" onBack={() => navigate("/")} showMenu={false} />
      <div className="screen--wide">
        {noRecruits ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No active recruits yet. Once recruits are added and testing begins, the command board will populate
              here.
            </p>
          </div>
        ) : (
          <>
            <div className="kpi-row">
              <KpiTile label="Active Recruits" value={kpis.activeRecruitCount} />
              <KpiTile
                label="Overall Pass %"
                value={kpis.overallPassRate == null ? "—" : `${Math.round(kpis.overallPassRate * 100)}%`}
              />
              <KpiTile label="Tests This Week" value={kpis.testsThisWeek} />
              <KpiTile label="At-Risk" value={kpis.atRiskCount} alert={kpis.atRiskCount > 0} />
            </div>

            <div className="flag-panel">
              <h2 className="section-heading" style={{ marginBottom: flagged.length ? 10 : 0 }}>
                ⚑ Flagged
              </h2>
              {flagged.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No flagged recruits — everyone&rsquo;s on track.
                </p>
              ) : (
                flagged.map((f) => (
                  <button
                    key={f.recruitId}
                    className="list-row"
                    onClick={() => navigate(`/reports/recruits/${f.recruitId}`)}
                  >
                    <div className="flagged-row">
                      <div>
                        <div style={{ fontWeight: 600 }}>{f.recruitName}</div>
                        <div className="muted">{f.templateName}</div>
                      </div>
                      <div className="flagged-row-badges">
                        {f.criticalFailure && <span className="badge critical">CRITICAL</span>}
                        <span className="badge fail">FAIL</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <h2 className="section-heading">Cohort Readiness</h2>
            {cohorts.length > 2 && (
              <div className="field" style={{ maxWidth: 260 }}>
                <select value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value)}>
                  {cohorts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="readiness-legend">
              <span>
                <span className="readiness-legend-dot" style={{ background: "var(--success)" }} />
                Pass
              </span>
              <span>
                <span className="readiness-legend-dot" style={{ background: "var(--brand-red)" }} />
                Fail
              </span>
              <span>
                <span className="readiness-legend-dot" style={{ background: "var(--border)" }} />
                Not tested
              </span>
            </div>

            {matrix.templates.length === 0 ? (
              <p className="muted">No active tests configured yet.</p>
            ) : matrixRecruits.length === 0 ? (
              <p className="muted">No recruits in this cohort.</p>
            ) : (
              <div className="readiness-scroll">
                <table className="readiness-grid">
                  <thead>
                    <tr>
                      <th className="readiness-corner">Recruit</th>
                      {matrix.templates.map((t) => (
                        <th key={t.id}>{t.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRecruits.map((r) => (
                      <tr key={r.id}>
                        <th className="readiness-row-head" scope="row">
                          <button
                            onClick={() => navigate(`/reports/recruits/${r.id}`)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              font: "inherit",
                              color: "inherit",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            {r.firstName} {r.lastName}
                          </button>
                        </th>
                        {matrix.templates.map((t) => {
                          const entry = matrix.latest.get(`${r.id}_${t.id}`);
                          const cls = !entry ? "pending" : entry.result === RESULT.PASS ? "pass" : "fail";
                          const label = !entry ? "—" : entry.result === RESULT.PASS ? "PASS" : "FAIL";
                          return (
                            <td key={t.id}>
                              <span className={`readiness-cell ${cls}`}>{label}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <h2 className="section-heading" style={{ marginTop: 20 }}>
          Reports
        </h2>
        <div className="quick-link-grid">
          {QUICK_LINKS.map(([title, desc, path]) => (
            <button key={path} className="card card--raised quick-link-card" onClick={() => navigate(path)}>
              <span className="quick-link-title">{title}</span>
              <span className="muted">{desc}</span>
            </button>
          ))}
        </div>

        <button
          className="secondary"
          style={{ marginTop: 16, color: "var(--brand-red)" }}
          onClick={() => setShowClearModal(true)}
        >
          Clear All Results
        </button>

        {showClearModal && (
          <ClearAllResultsModal
            onClose={() => setShowClearModal(false)}
            onCleared={async () => {
              const raw = await loadCommandBoardData();
              setData(raw);
              setShowClearModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
