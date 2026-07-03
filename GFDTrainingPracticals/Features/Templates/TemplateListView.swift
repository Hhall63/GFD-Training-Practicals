import SwiftUI

struct TemplateListView: View {
    @Environment(\.managedObjectContext) private var context
    @Environment(\.dismiss) private var dismiss
    @FetchRequest(fetchRequest: TestTemplate.fetchActive()) private var templates: FetchedResults<TestTemplate>

    @State private var showingNewTemplate = false

    var body: some View {
        List {
            ForEach(templates) { template in
                NavigationLink {
                    TemplateEditorView(template: template)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(template.name).font(.headline)
                        Text("\(template.linesArray.count) line\(template.linesArray.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .swipeActions {
                    Button("Retire", role: .destructive) {
                        template.isActive = false
                        try? context.save()
                    }
                }
            }
        }
        .overlay {
            if templates.isEmpty {
                ContentUnavailableView("No Test Templates", systemImage: "list.bullet.clipboard", description: Text("Build your first test template to start evaluating recruits."))
            }
        }
        .navigationTitle("Test Templates")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
            ToolbarItem(placement: .primaryAction) {
                Button("New", systemImage: "plus") { showingNewTemplate = true }
            }
        }
        .sheet(isPresented: $showingNewTemplate) {
            NewTemplateSheet()
        }
    }
}

private struct NewTemplateSheet: View {
    @Environment(\.managedObjectContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var createdTemplate: TestTemplate?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Test Name (e.g. Ladder Raise Evolution)", text: $name)
                TextField("Description (optional)", text: $description, axis: .vertical)
            }
            .navigationTitle("New Test Template")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let template = TestTemplate.create(name: name, description: description.isEmpty ? nil : description, in: context)
                        try? context.save()
                        createdTemplate = template
                    }
                    .disabled(name.isEmpty)
                }
            }
            .navigationDestination(item: $createdTemplate) { template in
                TemplateEditorView(template: template)
            }
        }
    }
}
