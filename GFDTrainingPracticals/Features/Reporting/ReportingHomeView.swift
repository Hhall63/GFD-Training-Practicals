import SwiftUI

struct ReportingHomeView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section("Recruits") {
                NavigationLink("Recruit History", destination: RecruitHistoryListView())
            }
            Section("Tests") {
                NavigationLink("Test Pass Rates", destination: TemplateReportListView())
            }
            Section("Cohorts") {
                NavigationLink("Cohort Dashboard", destination: CohortDashboardListView())
            }
            Section("Data") {
                NavigationLink("Export to Excel", destination: ExportOptionsView())
            }
        }
        .navigationTitle("Reports")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
    }
}
