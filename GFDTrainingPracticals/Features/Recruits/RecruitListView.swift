import SwiftUI

struct RecruitListView: View {
    @Environment(\.managedObjectContext) private var context
    @Environment(\.dismiss) private var dismiss
    @FetchRequest(fetchRequest: Recruit.fetchActive()) private var recruits: FetchedResults<Recruit>

    @State private var showingNewRecruit = false
    @State private var editingRecruit: Recruit?

    var body: some View {
        List {
            ForEach(recruits) { recruit in
                Button {
                    editingRecruit = recruit
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(recruit.fullName).font(.headline)
                            Text(recruit.recruitClassOrCohort).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                    }
                }
                .foregroundStyle(.primary)
                .swipeActions {
                    Button("Deactivate", role: .destructive) {
                        recruit.isActive = false
                        try? context.save()
                    }
                }
            }
        }
        .overlay {
            if recruits.isEmpty {
                ContentUnavailableView("No Recruits", systemImage: "person.2", description: Text("Add your first recruit to get started."))
            }
        }
        .navigationTitle("Recruits")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
            ToolbarItem(placement: .primaryAction) {
                Button("Add", systemImage: "plus") { showingNewRecruit = true }
            }
        }
        .sheet(isPresented: $showingNewRecruit) {
            NavigationStack { RecruitFormView(recruit: nil) }
        }
        .sheet(item: $editingRecruit) { recruit in
            NavigationStack { RecruitFormView(recruit: recruit) }
        }
    }
}
