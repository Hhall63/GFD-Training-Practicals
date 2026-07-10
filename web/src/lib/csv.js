import { lineDisplayLabel, LINE_TYPES } from "./constants";
import { summarizeObstacleCourseOneLine } from "./obstacleCourse";
import { htmlToPlainText } from "./richText";

const COLUMNS = [
  "Recruit Name", "Cohort", "Badge/ID", "Template Name",
  "Evaluator", "Session Date", "Attempt", "Overall Result", "Critical Failure",
  "Points Earned", "Points Possible", "Score %", "Passing %",
  "Line Order", "Line Text", "Line Type", "Result", "Timer Seconds", "Paused (s)",
  "Pass Threshold Seconds", "Line Points Earned", "Line Points Possible", "Note", "Has Photo",
  "Obstacle Course Detail",
];

function escape(field) {
  const str = String(field ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(value) {
  if (!value) return "";
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Builds a "tidy" (long-format) CSV — one row per graded/timer line result, with
 * session-level fields repeated on every row — which is what makes it easy to pivot-table
 * in Excel (e.g. pass rate by line, by cohort). `sessions` must already have `.lineResults`
 * attached (see ExportPage, which fetches each session's subcollection before calling this).
 */
export function buildResultsCsv(sessions) {
  const rows = [COLUMNS];

  for (const session of sessions) {
    const pointsPossible = session.totalPointsPossible ?? 0;
    const pointsEarned = session.totalPointsEarned ?? 0;
    const scorePercent = pointsPossible > 0 ? Math.round((pointsEarned / pointsPossible) * 100) : "";

    const base = [
      session.recruitName,
      session.recruitCohort ?? "",
      session.recruitBadge ?? "",
      session.templateName,
      session.evaluatorName,
      formatDate(session.startedAt),
      session.attemptType === "retake" ? "Retake" : "1st Attempt",
      (session.overallResult ?? "incomplete").toUpperCase(),
      session.criticalFailure ? "Y" : "",
      pointsPossible > 0 ? pointsEarned : "",
      pointsPossible > 0 ? pointsPossible : "",
      scorePercent,
      session.passingPercentageSnapshot ?? "",
    ];

    const lines = session.lineResults ?? [];
    if (lines.length === 0) {
      rows.push([...base, ...Array(COLUMNS.length - base.length).fill("")]);
      continue;
    }

    for (const line of lines) {
      rows.push([
        ...base,
        line.sortOrder,
        htmlToPlainText(lineDisplayLabel(line)),
        line.lineTypeSnapshot,
        (line.result ?? "").toUpperCase(),
        // The Overall Timer line records its elapsed time under `elapsedSeconds` rather than
        // the per-step Timer's `timerElapsedSeconds` (it isn't tied to a single step's
        // start/stop), so fall back to it here for that one line type.
        line.timerElapsedSeconds != null
          ? line.timerElapsedSeconds.toFixed(1)
          : line.elapsedSeconds != null
          ? line.elapsedSeconds.toFixed(1)
          : "",
        // "Paused (s)" — must be noted in the report per Task 10's requirement. Blank for
        // every line except the Overall Timer, which is the only one that can be paused.
        line.totalPausedSeconds != null ? line.totalPausedSeconds.toFixed(1) : "",
        line.passThresholdSecondsSnapshot ?? "",
        line.pointsEarned ?? "",
        line.pointsSnapshot ?? "",
        line.note ?? "",
        line.photoURLs?.length > 0 ? "Y" : "N",
        line.lineTypeSnapshot === LINE_TYPES.OBSTACLE_COURSE && line.obstacleCourseConfigSnapshot
          ? summarizeObstacleCourseOneLine(line.obstacleCourseConfigSnapshot, line.obstacleTallies)
          : "",
      ]);
    }
  }

  return rows.map((row) => row.map(escape).join(",")).join("\r\n");
}

export function downloadCsv(csvText, filename = "GFD_Test_Results.csv") {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
