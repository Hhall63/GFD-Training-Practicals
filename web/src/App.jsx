import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import LoginPage from "./pages/LoginPage";
import SetupAdminPage from "./pages/SetupAdminPage";
import HomePage from "./pages/HomePage";
import RecruitConfirmPage from "./pages/RecruitConfirmPage";
import LiveTestRunnerPage from "./pages/LiveTestRunnerPage";
import ResultsPage from "./pages/ResultsPage";
import RecruitsAdminPage from "./pages/RecruitsAdminPage";
import TemplatesAdminPage from "./pages/TemplatesAdminPage";
import TemplateEditorPage from "./pages/TemplateEditorPage";
import AdminsPage from "./pages/AdminsPage";
import ReportingHomePage from "./pages/reporting/ReportingHomePage";
import RecruitHistoryListPage from "./pages/reporting/RecruitHistoryListPage";
import RecruitHistoryDetailPage from "./pages/reporting/RecruitHistoryDetailPage";
import SessionDetailPage from "./pages/reporting/SessionDetailPage";
import TemplateReportListPage from "./pages/reporting/TemplateReportListPage";
import TemplateAggregateReportPage from "./pages/reporting/TemplateAggregateReportPage";
import CohortDashboardListPage from "./pages/reporting/CohortDashboardListPage";
import CohortDashboardPage from "./pages/reporting/CohortDashboardPage";
import ExportPage from "./pages/reporting/ExportPage";

function FullScreenLoading() {
  return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
}

/** Gate for every screen except /login and /setup — lets in any active account,
 * Administrator or Evaluator alike. */
function RequireAuth({ children }) {
  const { loading, adminDoc, anyAdminExists } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!adminDoc) {
    return <Navigate to={anyAdminExists ? "/login" : "/setup"} replace />;
  }
  return children;
}

/** Additional gate for Administrator-only screens (managing recruits, tests, other
 * accounts, and reporting) — Evaluators get bounced back to the Home Screen. Combine
 * with RequireAuth, which handles the logged-out case first. */
function RequireAdminRole({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { loading, adminDoc, anyAdminExists } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          loading ? (
            <FullScreenLoading />
          ) : adminDoc ? (
            <Navigate to="/" replace />
          ) : anyAdminExists ? (
            <LoginPage />
          ) : (
            <Navigate to="/setup" replace />
          )
        }
      />
      <Route
        path="/setup"
        element={
          loading ? (
            <FullScreenLoading />
          ) : adminDoc ? (
            <Navigate to="/" replace />
          ) : anyAdminExists ? (
            <Navigate to="/login" replace />
          ) : (
            <SetupAdminPage />
          )
        }
      />

      <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
      <Route path="/test/:templateId" element={<RequireAuth><RecruitConfirmPage /></RequireAuth>} />
      <Route path="/session/:sessionId/run" element={<RequireAuth><LiveTestRunnerPage /></RequireAuth>} />
      <Route path="/session/:sessionId/results" element={<RequireAuth><ResultsPage /></RequireAuth>} />

      <Route path="/recruits" element={<RequireAuth><RequireAdminRole><RecruitsAdminPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/templates" element={<RequireAuth><RequireAdminRole><TemplatesAdminPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/templates/:templateId" element={<RequireAuth><RequireAdminRole><TemplateEditorPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/admins" element={<RequireAuth><RequireAdminRole><AdminsPage /></RequireAdminRole></RequireAuth>} />

      <Route path="/reports" element={<RequireAuth><RequireAdminRole><ReportingHomePage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/recruits" element={<RequireAuth><RequireAdminRole><RecruitHistoryListPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/recruits/:recruitId" element={<RequireAuth><RequireAdminRole><RecruitHistoryDetailPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/sessions/:sessionId" element={<RequireAuth><RequireAdminRole><SessionDetailPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/templates" element={<RequireAuth><RequireAdminRole><TemplateReportListPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/templates/:templateId" element={<RequireAuth><RequireAdminRole><TemplateAggregateReportPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/cohorts" element={<RequireAuth><RequireAdminRole><CohortDashboardListPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/cohorts/:cohort" element={<RequireAuth><RequireAdminRole><CohortDashboardPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/reports/export" element={<RequireAuth><RequireAdminRole><ExportPage /></RequireAdminRole></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
