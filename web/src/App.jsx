import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import LoginPage from "./pages/LoginPage";
import SetupAdminPage from "./pages/SetupAdminPage";
import ConnectionErrorPage from "./pages/ConnectionErrorPage";
import ForceChangePasswordPage from "./pages/ForceChangePasswordPage";
import HomePage from "./pages/HomePage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import RecruitHomePage from "./pages/RecruitHomePage";
import RecruitConfirmPage from "./pages/RecruitConfirmPage";
import LiveTestRunnerPage from "./pages/LiveTestRunnerPage";
import ResultsPage from "./pages/ResultsPage";
import RecruitsAdminPage from "./pages/RecruitsAdminPage";
import DeactivatedRecruitsPage from "./pages/DeactivatedRecruitsPage";
import TemplatesAdminPage from "./pages/TemplatesAdminPage";
import TemplateEditorPage from "./pages/TemplateEditorPage";
import TestGroupsAdminPage from "./pages/TestGroupsAdminPage";
import BatchGradePage from "./pages/BatchGradePage";
import BatchGradeRosterPage from "./pages/BatchGradeRosterPage";
import ExamsAdminPage from "./pages/ExamsAdminPage";
import ExamScoresPage from "./pages/ExamScoresPage";
import ExamScoresGradingPage from "./pages/ExamScoresGradingPage";
import GroupSummaryPage from "./pages/GroupSummaryPage";
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
import LiveDashboardPage from "./pages/LiveDashboardPage";

function FullScreenLoading() {
  return <div className="screen center-column" style={{ paddingTop: 80 }}>Loading…</div>;
}

/** Gate for every screen except /login and /setup — any active account of any role. */
function RequireAuth({ children }) {
  const { loading, adminDoc, anyAdminExists, connectionError } = useAuth();
  if (connectionError) return <ConnectionErrorPage />;
  if (loading) return <FullScreenLoading />;
  if (!adminDoc) {
    return <Navigate to={anyAdminExists ? "/login" : "/setup"} replace />;
  }
  if (adminDoc.mustChangePassword) {
    return <ForceChangePasswordPage />;
  }
  return children;
}

/** Staff only (Administrators + Evaluators): the test-running screens. */
function RequireStaff({ children }) {
  const { isStaff } = useAuth();
  if (!isStaff) return <Navigate to="/" replace />;
  return children;
}

/** Administrator-only screens (managing recruits, tests, accounts, reporting). */
function RequireAdminRole({ children }) {
  const { role } = useAuth();
  if (role !== "admin") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { loading, adminDoc, anyAdminExists, connectionError, isRecruit, role } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          connectionError ? (
            <ConnectionErrorPage />
          ) : loading ? (
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
          connectionError ? (
            <ConnectionErrorPage />
          ) : loading ? (
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

      <Route path="/live/:token" element={<LiveDashboardPage />} />

      <Route path="/" element={<RequireAuth>{role === "admin" ? <AdminDashboardPage /> : isRecruit ? <RecruitHomePage /> : <HomePage />}</RequireAuth>} />
      <Route path="/start-test" element={<RequireAuth><RequireStaff><HomePage /></RequireStaff></RequireAuth>} />
      <Route path="/test/:templateId" element={<RequireAuth><RequireStaff><RecruitConfirmPage /></RequireStaff></RequireAuth>} />
      <Route path="/test/group/:groupId" element={<RequireAuth><RequireStaff><RecruitConfirmPage /></RequireStaff></RequireAuth>} />
      <Route path="/session/:sessionId/run" element={<RequireAuth><RequireStaff><LiveTestRunnerPage /></RequireStaff></RequireAuth>} />
      <Route path="/session/:sessionId/results" element={<RequireAuth><RequireStaff><ResultsPage /></RequireStaff></RequireAuth>} />
      <Route path="/session-group/:groupId/:recruitId" element={<RequireAuth><RequireStaff><GroupSummaryPage /></RequireStaff></RequireAuth>} />

      <Route path="/recruits" element={<RequireAuth><RequireAdminRole><RecruitsAdminPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/recruits/deactivated" element={<RequireAuth><RequireAdminRole><DeactivatedRecruitsPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/templates" element={<RequireAuth><RequireAdminRole><TemplatesAdminPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/templates/:templateId" element={<RequireAuth><RequireAdminRole><TemplateEditorPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/test-groups" element={<RequireAuth><RequireAdminRole><TestGroupsAdminPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/batch-grade" element={<RequireAuth><RequireAdminRole><BatchGradePage /></RequireAdminRole></RequireAuth>} />
      <Route path="/batch-grade/:templateId" element={<RequireAuth><RequireAdminRole><BatchGradeRosterPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/exams" element={<RequireAuth><RequireAdminRole><ExamsAdminPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/exam-scores" element={<RequireAuth><RequireAdminRole><ExamScoresPage /></RequireAdminRole></RequireAuth>} />
      <Route path="/exam-scores/:templateId" element={<RequireAuth><RequireAdminRole><ExamScoresGradingPage /></RequireAdminRole></RequireAuth>} />
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
