import SwiftUI

struct TemplateEditorView: View {
    @ObservedObject var template: TestTemplate
    @Environment(\.managedObjectContext) private var context

    // A scoped @FetchRequest (rather than reading template.linesArray directly) so SwiftUI
    // reliably re-renders this list after reordering, editing, or deleting a step — those
    // mutate the child TestLine objects, not the TestTemplate itself.
    @FetchRequest private var lines: FetchedResults<TestLine>

    @State private var showingNewLine = false
    @State private var editingLine: TestLine?

    init(template: TestTemplate) {
        self.template = template
        let request = TestLine.fetchRequest()
        request.predicate = NSPredicate(format: "template == %@", template)
        request.sortDescriptors = [NSSortDescriptor(keyPath: \TestLine.sortOrder, ascending: true)]
        _lines = FetchRequest(fetchRequest: request)
    }

    var body: some View {
        Form {
            Section("Details") {
                TextField("Name", text: Binding(
                    get: { template.name },
                    set: { template.name = $0; template.updatedAt = Date(); try? context.save() }
                ))
                TextField("Description", text: Binding(
                    get: { template.templateDescription ?? "" },
                    set: { template.templateDescription = $0.isEmpty ? nil : $0; try? context.save() }
                ), axis: .vertical)
            }

            Section {
                ForEach(lines) { line in
                    Button {
                        editingLine = line
                    } label: {
                        HStack {
                            Image(systemName: icon(for: line.type))
                                .foregroundStyle(Brand.navy)
                                .frame(width: 24)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.lineText)
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                                Text(subtitle(for: line))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .onMove(perform: moveLines)
                .onDelete(perform: deleteLines)
            } header: {
                Text("Test Steps, In Order")
            } footer: {
                Text("Steps run top to bottom during a live test. Drag to reorder.")
            }
        }
        .navigationTitle(template.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Add Step", systemImage: "plus") { showingNewLine = true }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                EditButton()
            }
        }
        .sheet(isPresented: $showingNewLine) {
            NavigationStack { TestLineEditorView(template: template, line: nil) }
        }
        .sheet(item: $editingLine) { line in
            NavigationStack { TestLineEditorView(template: template, line: line) }
        }
    }

    private func icon(for type: TestLineType) -> String {
        switch type {
        case .instruction: return "info.circle"
        case .graded: return "checkmark.circle"
        case .timer: return "timer"
        }
    }

    private func subtitle(for line: TestLine) -> String {
        switch line.type {
        case .instruction: return "Instruction"
        case .graded: return "Graded Step (\(line.mode?.displayName ?? "Pass/Fail"))"
        case .timer:
            if let threshold = line.passThresholdSeconds?.doubleValue {
                return "Timer — pass at \u{2264} \(Int(threshold))s"
            }
            return "Timer"
        }
    }

    private func moveLines(from source: IndexSet, to destination: Int) {
        var reordered = Array(lines)
        reordered.move(fromOffsets: source, toOffset: destination)
        for (index, line) in reordered.enumerated() {
            line.sortOrder = Int32(index)
        }
        try? context.save()
    }

    private func deleteLines(at offsets: IndexSet) {
        // Capture the survivors before deleting anything, so we never touch an
        // already-deleted managed object while renumbering.
        let remaining = lines.enumerated().filter { !offsets.contains($0.offset) }.map(\.element)
        for index in offsets {
            context.delete(lines[index])
        }
        for (index, line) in remaining.enumerated() {
            line.sortOrder = Int32(index)
        }
        try? context.save()
    }
}
