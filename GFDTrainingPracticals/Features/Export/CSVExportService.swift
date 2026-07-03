import Foundation

/// Builds Excel-openable CSV exports of test results in "tidy" (long) format — one row per
/// graded/timer line result, with session-level fields repeated on every row. Tidy format is
/// what makes the export easy to pivot-table in Excel (e.g. pass rate by line, by cohort).
///
/// CSV rather than a real `.xlsx` file is a deliberate choice (see the project plan): Excel
/// opens CSV natively, and it avoids depending on a third-party OOXML-writing library for a
/// compliance-relevant export.
enum CSVExportService {
    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter
    }()

    private static let columns = [
        "Recruit Name", "Cohort", "Badge/ID", "Template Name", "Template Version",
        "Evaluator", "Session Date", "Overall Result",
        "Line Order", "Line Text", "Line Type", "Result", "Timer Seconds",
        "Pass Threshold Seconds", "Points Awarded", "Note", "Has Photo"
    ]

    static func csv(for sessions: [TestSession]) -> String {
        var rows: [[String]] = [columns]

        for session in sessions.sorted(by: { $0.startedAt < $1.startedAt }) {
            let recruitName = session.recruit?.fullName ?? "—"
            let cohort = session.recruit?.recruitClassOrCohort ?? "—"
            let badge = session.recruit?.badgeOrIdNumber ?? ""
            let templateName = session.template?.name ?? "—"
            let templateVersion = session.template.map { String($0.version) } ?? ""
            let sessionDate = dateFormatter.string(from: session.startedAt)
            let overallResult = session.result?.rawValue.uppercased() ?? "INCOMPLETE"

            let lineResults = session.lineResultsArray
            if lineResults.isEmpty {
                rows.append([
                    recruitName, cohort, badge, templateName, templateVersion,
                    session.evaluatorName, sessionDate, overallResult,
                    "", "", "", "", "", "", "", "", ""
                ])
                continue
            }

            for line in lineResults {
                rows.append([
                    recruitName, cohort, badge, templateName, templateVersion,
                    session.evaluatorName, sessionDate, overallResult,
                    String(line.sortOrder),
                    line.lineTextSnapshot,
                    line.lineTypeSnapshot,
                    line.lineResult?.rawValue.uppercased() ?? "",
                    line.timerElapsedSeconds.map { String(format: "%.1f", $0) } ?? "",
                    line.passThresholdSecondsSnapshot?.doubleValue.map { String(format: "%.1f", $0) } ?? "",
                    line.pointsAwarded.map { String($0.intValue) } ?? "",
                    line.note ?? "",
                    line.attachmentsArray.contains { $0.photoAsset != nil } ? "Y" : "N"
                ])
            }
        }

        return rows.map { row in row.map(escape).joined(separator: ",") }.joined(separator: "\r\n")
    }

    /// Writes the CSV to a temporary file suitable for `ShareLink`/`UIActivityViewController`.
    static func writeToTemporaryFile(sessions: [TestSession], filename: String = "GFD_Test_Results") -> URL? {
        let csv = csv(for: sessions)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(filename)_\(Int(Date().timeIntervalSince1970))")
            .appendingPathExtension("csv")
        do {
            try csv.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            return nil
        }
    }

    private static func escape(_ field: String) -> String {
        guard field.contains(",") || field.contains("\"") || field.contains("\n") else { return field }
        return "\"\(field.replacingOccurrences(of: "\"", with: "\"\""))\""
    }
}
