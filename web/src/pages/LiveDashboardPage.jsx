import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { signInAnonymouslyOnSecondaryApp } from "../firebase";
import { loadCommandBoardData, buildCommandBoard } from "../lib/reportsData";
import { RESULT } from "../lib/constants";

// Fixed in production. Only overridable via query string when VITE_USE_EMULATOR is set (see
// below), so a real visitor can never weaken the 8-hour timeout by editing the URL.
const REFRESH_INTERVAL_MS = 90 * 1000;
const TIMEOUT_MS = 8 * 60 * 60 * 1000;

function KpiTile({ label, value, alert }) {
  return (
    <div className="card card--raised kpi-tile">
      <span className="eyebrow">{label}</span>
      <span className="kpi-accent" aria-hidden="true" />
      <span className={`kpi-value${alert ? " kpi-value--alert" : ""}`}>{value}</span>
    </div>
  );
}

export default function LiveDashboardPage() {
  const { token } = useParams();
  const [phase, setPhase] = useState("loading"); // loading | invalid | error | active | expired
  const [board, setBoard] = useState(null);
  const [noRecruits, setNoRecruits] = useState(false);
  const refreshIntervalRef = useRef(null);
  const timeoutRef = useRef(null);
  // Holds the secondary Firebase App's cleanup() once signInAnonymouslyOnSecondaryApp()
  // resolves, so the unmount effect below can tear down the anonymous session/app even if
  // the visitor navigates away client-side (via router, not a full reload) while active.
  const cleanupRef = useRef(null);

  const isEmulator = import.meta.env.VITE_USE_EMULATOR === "1";
  const searchParams = new URLSearchParams(window.location.search);
  const refreshMs =
    isEmulator && searchParams.get("refreshMs") ? Number(searchParams.get("refreshMs")) : REFRESH_INTERVAL_MS;
  const timeoutMs =
    isEmulator && searchParams.get("timeoutMs") ? Number(searchParams.get("timeoutMs")) : TIMEOUT_MS;

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // This is a public page with no admin nearby to notice a silent hang: if anything in
      // here throws (most notably signInAnonymously() failing because the Auth service is
      // unreachable), show the visitor a clear message instead of leaving them staring at
      // "Loading live dashboard…" forever.
      try {
        const { db: secondaryDb, cleanup } = await signInAnonymouslyOnSecondaryApp();
        cleanupRef.current = cleanup;
        if (cancelled) {
          cleanup();
          return;
        }

        const linkSnap = await getDoc(doc(secondaryDb, "publicLiveLinks", token));
        if (cancelled) return;
        if (!linkSnap.exists() || linkSnap.data().active !== true) {
          setPhase("invalid");
          return;
        }

        async function refresh() {
          const raw = await loadCommandBoardData(secondaryDb);
          if (cancelled) return;
          setNoRecruits(raw.recruits.length === 0);
          setBoard(buildCommandBoard(raw));
        }

        await refresh();
        if (cancelled) return;
        setPhase("active");

        refreshIntervalRef.current = setInterval(() => {
          // A single transient refresh failure (e.g. a momentary network blip) shouldn't
          // tear down an already-active board view — just skip that tick and try again on
          // the next interval.
          refresh().catch((err) => console.error("Live dashboard refresh failed:", err));
        }, refreshMs);
        timeoutRef.current = setTimeout(() => {
          clearInterval(refreshIntervalRef.current);
          setPhase("expired");
        }, timeoutMs);
      } catch (err) {
        if (!cancelled) {
          console.error("Live dashboard failed to initialize:", err);
          setPhase("error");
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      clearInterval(refreshIntervalRef.current);
      clearTimeout(timeoutRef.current);
      cleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (phase === "loading") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        Loading live dashboard…
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <h2>This link is no longer active</h2>
        <p className="muted">Ask an administrator for the current live dashboard link.</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <h2>Something went wrong</h2>
        <p className="muted">This live dashboard couldn&rsquo;t be loaded. Please try reloading the page.</p>
      </div>
    );
  }

  if (phase === "expired") {
    return (
      <div className="screen center-column" style={{ paddingTop: 80 }}>
        <h2>Session expired</h2>
        <p className="muted">
          This live dashboard view expires after 8 hours. Reload the link to continue viewing.
        </p>
      </div>
    );
  }

  const { kpis, flagged, matrix } = board;

  return (
    <div className="app-shell">
      <div className="screen--wide">
        {noRecruits ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>
              No active recruits yet.
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
                  <div key={f.recruitId} className="list-row" style={{ cursor: "default" }}>
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
                  </div>
                ))
              )}
            </div>

            <h2 className="section-heading">Cohort Readiness</h2>
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
                    {matrix.recruits.map((r) => (
                      <tr key={r.id}>
                        <th className="readiness-row-head" scope="row">
                          {r.firstName} {r.lastName}
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
      </div>
    </div>
  );
}
