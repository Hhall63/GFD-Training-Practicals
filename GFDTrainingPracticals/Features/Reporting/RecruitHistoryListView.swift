import SwiftUI

struct RecruitHistoryListView: View {
    @FetchRequest(fetchRequest: Recruit.fetchActive()) private var recruits: FetchedResults<Recruit>

    var body: some View {
        List(recruits) { recruit in
            NavigationLink {
                RecruitHistoryDetailView(recruit: recruit)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(recruit.fullName).font(.headline)
                    Text(summary(for: recruit)).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Recruit History")
        .overlay {
            if recruits.isEmpty {
                ContentUnavailableView("No Recruits", systemImage: "person.2")
            }
        }
    }

    private func summary(for recruit: Recruit) -> String {
        let sessions = recruit.sessionsArray.filter { $0.sessionStatus == .completed }
        guard !sessions.isEmpty else { return "No completed tests yet" }
        let passCount = sessions.filter { $0.result == .pass }.count
        return "\(sessions.count) session\(sessions.count == 1 ? "" : "s") · \(passCount) pass, \(sessions.count - passCount) fail"
    }
}

struct RecruitHistoryDetailView: View {
    @ObservedObject var recruit: Recruit

    private var sessions: [TestSession] {
        recruit.sessionsArray.filter { $0.sessionStatus == .completed }
    }

    var body: some View {
        List {
            Section {
                HStack(spacing: 16) {
                    if let image = recruit.photoImage {
                        Image(uiImage: image).resizable().scaledToFill()
                            .frame(width: 64, height: 64).clipShape(Circle())
                    } else {
                        Circle().fill(Brand.navy.opacity(0.15)).frame(width: 64, height: 64)
                    }
                    VStack(alignment: .leading) {
                        Text(recruit.fullName).font(.title3.weight(.semibold))
                        Text(recruit.recruitClassOrCohort).foregroundStyle(.secondary)
                    }
                }
            }

            Section("Sessions") {
                if sessions.isEmpty {
                    Text("No completed tests yet.").foregroundStyle(.secondary)
                }
                ForEach(sessions, id: \.id) { session in
                    NavigationLink {
                        ReadOnlySessionDetailView(session: session)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(session.template?.name ?? "—")
                                Text(session.startedAt.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            resultBadge(session.result)
                        }
                    }
                }
            }
        }
        .navigationTitle(recruit.fullName)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func resultBadge(_ result: OverallResult?) -> some View {
        switch result {
        case .pass:
            Text("PASS").font(.caption.weight(.bold)).foregroundStyle(.green)
        case .fail:
            Text("FAIL").font(.caption.weight(.bold)).foregroundStyle(Brand.red)
        case nil:
            Text("—").foregroundStyle(.secondary)
        }
    }
}
