import SwiftUI

/// Create or edit a single step (line) within a test template. Pass `line: nil` to append a
/// new step to the end of the template.
///
/// Graded steps are Pass/Fail only for now — that's the only grading mode the live test
/// runner actually implements end to end.
struct TestLineEditorView: View {
    let template: TestTemplate
    let line: TestLine?

    @Environment(\.managedObjectContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var type: TestLineType = .instruction
    @State private var text = ""
    @State private var passThresholdSeconds: Double = 30

    var body: some View {
        Form {
            Section("Step Type") {
                Picker("Type", selection: $type) {
                    ForEach(TestLineType.allCases) { type in
                        Text(type.displayName).tag(type)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section(type == .instruction ? "Instruction Text" : "Step Description") {
                TextField("What should happen at this step?", text: $text, axis: .vertical)
            }

            if type == .timer {
                Section("Timer") {
                    Stepper("Pass at \u{2264} \(Int(passThresholdSeconds)) seconds", value: $passThresholdSeconds, in: 1...600)
                }
            }
        }
        .navigationTitle(line == nil ? "New Step" : "Edit Step")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { save() }.disabled(text.isEmpty)
            }
        }
        .onAppear(perform: loadExistingValues)
    }

    private func loadExistingValues() {
        guard let line else { return }
        type = line.type
        text = line.lineText
        passThresholdSeconds = line.passThresholdSeconds?.doubleValue ?? 30
    }

    private func save() {
        let target = line ?? template.addLine(type: type, text: text, in: context)
        target.type = type
        target.lineText = text
        target.isScored = (type == .graded)

        target.mode = (type == .graded) ? .passFail : nil
        target.maxPoints = nil

        target.passThresholdSeconds = (type == .timer) ? NSNumber(value: passThresholdSeconds) : nil

        template.updatedAt = Date()
        try? context.save()
        dismiss()
    }
}
