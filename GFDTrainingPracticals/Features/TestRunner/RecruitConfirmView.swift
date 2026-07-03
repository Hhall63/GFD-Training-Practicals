import SwiftUI

/// Reached after picking a test on the Home Screen. Lets the evaluator pick which recruit
/// is being tested, then shows a large name + photo card so the evaluator can visually
/// confirm they've got the right person before the clock starts.
struct RecruitConfirmView: View {
    let template: TestTemplate
    @Binding var path: [HomeRoute]

    @EnvironmentObject private var session: SessionManager
    @Environment(\.managedObjectContext) private var context
    @FetchRequest(fetchRequest: Recruit.fetchActive()) private var recruits: FetchedResults<Recruit>

    @State private var selectedRecruit: Recruit?
    @State private var searchText = ""

    private var filteredRecruits: [Recruit] {
        guard !searchText.isEmpty else { return Array(recruits) }
        return recruits.filter { $0.fullName.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        Group {
            if let recruit = selectedRecruit {
                confirmationCard(for: recruit)
            } else {
                recruitPicker
            }
        }
        .navigationTitle(template.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var recruitPicker: some View {
        List(filteredRecruits) { recruit in
            Button {
                selectedRecruit = recruit
            } label: {
                HStack(spacing: 12) {
                    recruitThumbnail(recruit, size: 44)
                    VStack(alignment: .leading) {
                        Text(recruit.fullName).font(.body)
                        Text(recruit.recruitClassOrCohort).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .foregroundStyle(.primary)
        }
        .searchable(text: $searchText, prompt: "Search recruits")
        .overlay {
            if recruits.isEmpty {
                ContentUnavailableView(
                    "No Recruits Yet",
                    systemImage: "person.2.slash",
                    description: Text("Add recruits from the Home Screen menu under Manage Recruits.")
                )
            }
        }
    }

    private func confirmationCard(for recruit: Recruit) -> some View {
        VStack(spacing: 24) {
            Spacer()

            recruitThumbnail(recruit, size: 180)
                .shadow(radius: 4)

            VStack(spacing: 4) {
                Text(recruit.fullName)
                    .font(.largeTitle.weight(.bold))
                Text(recruit.recruitClassOrCohort)
                    .font(.headline)
                    .foregroundStyle(.secondary)
                if let badge = recruit.badgeOrIdNumber, !badge.isEmpty {
                    Text("ID: \(badge)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }

            Text("Confirm this is the recruit being tested on \u{201c}\(template.name)\u{201d}.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Spacer()

            VStack(spacing: 12) {
                Button("Begin Test") {
                    beginTest(for: recruit)
                }
                .brandPrimaryButton()

                Button("Choose a Different Recruit") {
                    selectedRecruit = nil
                }
                .font(.subheadline)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 24)
        }
    }

    @ViewBuilder
    private func recruitThumbnail(_ recruit: Recruit, size: CGFloat) -> some View {
        if let image = recruit.photoImage {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
        } else {
            Circle()
                .fill(Brand.navy.opacity(0.15))
                .frame(width: size, height: size)
                .overlay {
                    Text(initials(for: recruit))
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(Brand.navy)
                }
        }
    }

    private func initials(for recruit: Recruit) -> String {
        [recruit.firstName, recruit.lastName]
            .compactMap { $0.first.map(String.init) }
            .joined()
    }

    private func beginTest(for recruit: Recruit) {
        let evaluatorName = session.currentAdmin?.fullNameOrUsername ?? "Unknown Evaluator"
        let newSession = TestSession.start(recruit: recruit, template: template, evaluatorName: evaluatorName, in: context)
        try? context.save()
        path.append(.liveTest(sessionID: ManagedObjectIDBox(objectID: newSession.objectID)))
    }
}
