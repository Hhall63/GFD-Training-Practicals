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

/** Gate for every screen except /login and /setup. */
function RequireAdmin({ children }) {
  const { loading, adminDoc, anyAdminExists } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!adminDoc) {
    return <Navigate to={anyAdminExists ? "/login" : "/setup"} replace />;
  }
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

      <Route path="/" element={<RequireAdmin><HomePage /></RequireAdmin>} />
      <Route path="/test/:templateId" element={<RequireAdmin><RecruitConfirmPage /></RequireAdmin>} />
      <Route path="/session/:sessionId/run" element={<RequireAdmin><LiveTestRunnerPage /></RequireAdmin>} />
      <Route path="/session/:sessionId/results" element={<RequireAdmin><ResultsPage /></RequireAdmin>} />

      <Route path="/recruits" element={<RequireAdmin><RecruitsAdminPage /></RequireAdmin>} />
      <Route path="/templates" element={<RequireAdmin><TemplatesAdminPage /></RequireAdmin>} />
      <Route path="/templates/:templateId" element={<RequireAdmin><TemplateEditorPage /></RequireAdmin>} />
      <Route path="/admins" element={<RequireAdmin><AdminsPage /></RequireAdmin>} />

      <Route path="/reports" element={<RequireAdmin><ReportingHomePage /></RequireAdmin>} />
      <Route path="/reports/recruits" element={<RequireAdmin><RecruitHistoryListPage /></RequireAdmin>} />
      <Route path="/reports/recruits/:recruitId" element={<RequireAdmin><RecruitHistoryDetailPage /></RequireAdmin>} />
      <Route path="/reports/sessions/:sessionId" element={<RequireAdmin><SessionDetailPage /></RequireAdmin>} />
      <Route path="/reports/templates" element={<RequireAdmin><TemplateReportListPage /></RequireAdmin>} />
      <Route path="/reports/templates/:templateId" element={<RequireAdmin><TemplateAggregateReportPage /></RequireAdmin>} />
      <Route path="/reports/cohorts" element={<RequireAdmin><CohortDashboardListPage /></RequireAdmin>} />
      <Route path="/reports/cohorts/:cohort" element={<RequireAdmin><CohortDashboardPage /></RequireAdmin>} />
      <Route path="/reports/export" element={<RequireAdmin><ExportPage /></RequireAdmin>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
