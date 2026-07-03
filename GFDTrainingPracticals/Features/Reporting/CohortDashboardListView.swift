import SwiftUI

struct CohortDashboardListView: View {
    @FetchRequest(fetchRequest: Recruit.fetchActive()) private var recruits: FetchedResults<Recruit>

    private var cohorts: [String] {
        Set(recruits.map { $0.recruitClassOrCohort }).sorted()
    }

    var body: some View {
        List(cohorts, id: \.self) { cohort in
            NavigationLink(cohort) {
                CohortDashboardView(cohort: cohort)
            }
        }
        .navigationTitle("Cohort Dashboard")
        .overlay {
            if cohorts.isEmpty {
                ContentUnavailableView("No Cohorts Yet", systemImage: "person.3")
            }
        }
    }
}

/// A training-matrix view: every active recruit in a cohort against every active test
/// template, so a training officer can see at a glance who still needs to test on what
/// before a graduation/certification decision.
struct CohortDashboardView: View {
    let cohort: String

    @FetchRequest private var recruits: FetchedResults<Recruit>
    @FetchRequest(fetchRequest: TestTemplate.fetchActive()) private var templates: FetchedResults<TestTemplate>

    init(cohort: String) {
        self.cohort = cohort
        let request = Recruit.fetchActive()
        request.predicate = NSPredicate(format: "isActive == YES AND recruitClassOrCohort == %@", cohort)
        _recruits = FetchRequest(fetchRequest: request)
    }

    private var overallPassRate: Double {
        let allCompleted = recruits.flatMap { $0.sessionsArray }.filter { $0.sessionStatus == .completed }
        guard !allCompleted.isEmpty else { return 0 }
        return Double(allCompleted.filter { $0.result == .pass }.count) / Double(allCompleted.count)
    }

    var body: some View {
        List {
            Section {
                LabeledContent("Recruits", value: "\(recruits.count)")
                LabeledContent("Overall Pass Rate", value: "\(Int(overallPassRate * 100))%")
            }

            Section("Training Matrix") {
                ForEach(recruits) { recruit in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(recruit.fullName).font(.subheadline.weight(.semibold))
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(templates) { template in
                                    statusChip(recruit: recruit, template: template)
                                }
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle(cohort)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func statusChip(recruit: Recruit, template: TestTemplate) -> some View {
        let latest = recruit.sessionsArray.first {
            $0.template === template && $0.sessionStatus == .completed
        }

        let (label, color): (String, Color) = {
            switch latest?.result {
            case .pass: return ("Pass", .green)
            case .fail: return ("Fail", Brand.red)
            case nil: return ("Not Tested", .secondary)
            }
        }()

        return VStack(spacing: 2) {
            Text(template.name).font(.caption2).lineLimit(1)
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(color)
        }
        .padding(8)
        .frame(minWidth: 90)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
    }
}
