import SwiftUI

/// Lets the evaluator export a filtered set of test results to a CSV file that opens
/// directly in Excel, then hand it off via AirDrop/email/Files using the system share sheet.
struct ExportOptionsView: View {
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \TestSession.startedAt, ascending: false)]
    ) private var allSessions: FetchedResults<TestSession>

    @State private var selectedCohort: String = "All Cohorts"
    @State private var selectedTemplateName: String = "All Tests"
    @State private var exportURL: URL?

    private var cohorts: [String] {
        ["All Cohorts"] + Set(allSessions.compactMap { $0.recruit?.recruitClassOrCohort }).sorted()
    }

    private var templateNames: [String] {
        ["All Tests"] + Set(allSessions.compactMap { $0.template?.name }).sorted()
    }

    private var filteredSessions: [TestSession] {
        allSessions.filter { session in
            (selectedCohort == "All Cohorts" || session.recruit?.recruitClassOrCohort == selectedCohort)
                && (selectedTemplateName == "All Tests" || session.template?.name == selectedTemplateName)
        }
    }

    var body: some View {
        Form {
            Section("Filter") {
                Picker("Cohort", selection: $selectedCohort) {
                    ForEach(cohorts, id: \.self) { Text($0) }
                }
                Picker("Test", selection: $selectedTemplateName) {
                    ForEach(templateNames, id: \.self) { Text($0) }
                }
            }

            Section {
                Text("\(filteredSessions.count) session\(filteredSessions.count == 1 ? "" : "s") will be exported.")
                    .foregroundStyle(.secondary)

                Button("Prepare CSV Export") {
                    exportURL = CSVExportService.writeToTemporaryFile(sessions: filteredSessions)
                }
                .disabled(filteredSessions.isEmpty)
            }

            if let exportURL {
                Section {
                    ShareLink(item: exportURL) {
                        Label("Share / Save CSV File", systemImage: "square.and.arrow.up")
                    }
                }
            }
        }
        .navigationTitle("Export to Excel")
        .navigationBarTitleDisplayMode(.inline)
    }
}
