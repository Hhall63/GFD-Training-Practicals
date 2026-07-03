import SwiftUI

struct TemplateReportListView: View {
    @FetchRequest(fetchRequest: TestTemplate.fetchActive()) private var templates: FetchedResults<TestTemplate>

    var body: some View {
        List(templates) { template in
            NavigationLink(template.name) {
                TemplateAggregateReportView(template: template)
            }
        }
        .navigationTitle("Test Pass Rates")
        .overlay {
            if templates.isEmpty {
                ContentUnavailableView("No Test Templates", systemImage: "list.bullet.clipboard")
            }
        }
    }
}

struct TemplateAggregateReportView: View {
    @ObservedObject var template: TestTemplate

    private var completedSessions: [TestSession] {
        template.sessionsArray.filter { $0.sessionStatus == .completed }
    }

    private var passRate: Double {
        guard !completedSessions.isEmpty else { return 0 }
        let passes = completedSessions.filter { $0.result == .pass }.count
        return Double(passes) / Double(completedSessions.count)
    }

    /// Per-line failure rate across every session ever run against this template — helps
    /// identify which specific step recruits struggle with most.
    private var lineFailureRates: [(text: String, failed: Int, total: Int)] {
        var counts: [String: (failed: Int, total: Int)] = [:]
        var order: [String] = []
        for session in completedSessions {
            for lineResult in session.lineResultsArray where lineResult.lineTypeSnapshot != TestLineType.instruction.rawValue {
                let key = lineResult.lineTextSnapshot
                if counts[key] == nil {
                    counts[key] = (0, 0)
                    order.append(key)
                }
                counts[key]!.total += 1
                if lineResult.lineResult == .fail { counts[key]!.failed += 1 }
            }
        }
        return order.map { (text: $0, failed: counts[$0]!.failed, total: counts[$0]!.total) }
    }

    var body: some View {
        List {
            Section("Overview") {
                LabeledContent("Sessions", value: "\(completedSessions.count)")
                LabeledContent("Overall Pass Rate", value: completedSessions.isEmpty ? "—" : "\(Int(passRate * 100))%")
            }

            Section("Failure Rate by Step") {
                if lineFailureRates.isEmpty {
                    Text("No completed sessions yet.").foregroundStyle(.secondary)
                }
                ForEach(lineFailureRates, id: \.text) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.text)
                        Text("Failed \(row.failed) of \(row.total) (\(Int(Double(row.failed) / Double(row.total) * 100))%)")
                            .font(.caption)
                            .foregroundStyle(row.failed > 0 ? Brand.red : .secondary)
                    }
                }
            }
        }
        .navigationTitle(template.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
