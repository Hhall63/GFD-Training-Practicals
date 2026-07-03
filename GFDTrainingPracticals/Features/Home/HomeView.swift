import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: SessionManager
    @Environment(\.managedObjectContext) private var context
    @FetchRequest(fetchRequest: TestTemplate.fetchActive()) private var templates: FetchedResults<TestTemplate>

    @State private var path: [HomeRoute] = []
    @State private var showingManageRecruits = false
    @State private var showingManageTemplates = false
    @State private var showingReporting = false
    @State private var showingAdmins = false

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section {
                    ForEach(templates) { template in
                        Button {
                            path.append(.recruitConfirm(templateID: ManagedObjectIDBox(objectID: template.objectID)))
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(template.name).font(.headline)
                                if let description = template.templateDescription, !description.isEmpty {
                                    Text(description)
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                Text("\(template.gradedAndTimerLineCount) graded step\(template.gradedAndTimerLineCount == 1 ? "" : "s")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                        .foregroundStyle(.primary)
                    }
                } header: {
                    Text("Select a Test")
                } footer: {
                    if templates.isEmpty {
                        Text("No test templates yet. Use Manage Tests below to build one.")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("GFD Recruit Testing")
            .toolbar {
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 8) {
                        Brand.badgeImage.resizable().scaledToFit().frame(width: 28)
                        Text("GFD Recruit Testing").font(.headline)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Manage Recruits", systemImage: "person.2") { showingManageRecruits = true }
                        Button("Manage Tests", systemImage: "list.bullet.clipboard") { showingManageTemplates = true }
                        Button("Reports", systemImage: "chart.bar") { showingReporting = true }
                        Button("Administrators", systemImage: "person.badge.key") { showingAdmins = true }
                        Divider()
                        Button("Sign Out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                            session.logOut()
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .navigationDestination(for: HomeRoute.self) { route in
                destination(for: route)
            }
            .sheet(isPresented: $showingManageRecruits) {
                NavigationStack { RecruitListView() }
            }
            .sheet(isPresented: $showingManageTemplates) {
                NavigationStack { TemplateListView() }
            }
            .sheet(isPresented: $showingReporting) {
                NavigationStack { ReportingHomeView() }
            }
            .sheet(isPresented: $showingAdmins) {
                NavigationStack { AdminAccountManagementView() }
            }
        }
    }

    @ViewBuilder
    private func destination(for route: HomeRoute) -> some View {
        switch route {
        case .recruitConfirm(let templateID):
            if let template = try? context.existingObject(with: templateID.objectID) as? TestTemplate {
                RecruitConfirmView(template: template, path: $path)
            }
        case .liveTest(let sessionID):
            if let session = try? context.existingObject(with: sessionID.objectID) as? TestSession {
                LiveTestRunnerView(session: session, path: $path)
            }
        case .results(let sessionID):
            if let session = try? context.existingObject(with: sessionID.objectID) as? TestSession {
                SessionResultsView(session: session, path: $path)
            }
        }
    }
}

#Preview {
    HomeView()
        .environmentObject(SessionManager(context: PersistenceController.preview.container.viewContext))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
