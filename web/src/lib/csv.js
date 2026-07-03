const COLUMNS = [
  "Recruit Name", "Cohort", "Badge/ID", "Template Name",
  "Evaluator", "Session Date", "Overall Result",
  "Line Order", "Line Text", "Line Type", "Result", "Timer Seconds",
  "Pass Threshold Seconds", "Note", "Has Photo",
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
    const base = [
      session.recruitName,
      session.recruitCohort ?? "",
      session.recruitBadge ?? "",
      session.templateName,
      session.evaluatorName,
      formatDate(session.startedAt),
      (session.overallResult ?? "incomplete").toUpperCase(),
    ];

    const lines = session.lineResults ?? [];
    if (lines.length === 0) {
      rows.push([...base, "", "", "", "", "", "", "", ""]);
      continue;
    }

    for (const line of lines) {
      rows.push([
        ...base,
        line.sortOrder,
        line.lineTextSnapshot,
        line.lineTypeSnapshot,
        (line.result ?? "").toUpperCase(),
        line.timerElapsedSeconds != null ? line.timerElapsedSeconds.toFixed(1) : "",
        line.passThresholdSecondsSnapshot ?? "",
        line.note ?? "",
        line.photoURLs?.length > 0 ? "Y" : "N",
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
