import SwiftUI

/// Photo + note capture for a single line result. Required (enforced by the caller) when the
/// line is marked Fail; optional and collapsed by default when it's a Pass.
struct AttachmentCaptureView: View {
    @ObservedObject var lineResult: TestLineResult
    let isRequired: Bool

    @Environment(\.managedObjectContext) private var context
    @State private var showingCamera = false
    @State private var pendingImage: UIImage?
    @State private var noteText: String = ""
    @State private var isExpanded: Bool

    init(lineResult: TestLineResult, isRequired: Bool) {
        self.lineResult = lineResult
        self.isRequired = isRequired
        _isExpanded = State(initialValue: isRequired)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                isExpanded.toggle()
            } label: {
                HStack {
                    Image(systemName: isRequired ? "exclamationmark.triangle.fill" : "paperclip")
                        .foregroundStyle(isRequired ? Brand.red : .secondary)
                    Text(isRequired ? "Photo or note required for a Fail result" : "Add photo or note (optional)")
                        .font(.footnote.weight(isRequired ? .semibold : .regular))
                    Spacer()
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.footnote)
                }
                .foregroundStyle(isRequired ? Brand.red : .secondary)
            }

            if isExpanded {
                if !lineResult.attachmentsArray.isEmpty {
                    ForEach(lineResult.attachmentsArray, id: \.id) { attachment in
                        HStack(spacing: 8) {
                            if let image = attachment.photoImage {
                                Image(uiImage: image).resizable().scaledToFill()
                                    .frame(width: 44, height: 44)
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                            if let note = attachment.noteText, !note.isEmpty {
                                Text(note).font(.caption)
                            }
                        }
                    }
                }

                if let pendingImage {
                    Image(uiImage: pendingImage)
                        .resizable().scaledToFit()
                        .frame(maxHeight: 160)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                HStack {
                    Button("Take Photo", systemImage: "camera") { showingCamera = true }
                        .buttonStyle(.bordered)
                    Spacer()
                }

                TextField("Note", text: $noteText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)

                Button("Save Attachment") {
                    saveAttachment()
                }
                .buttonStyle(.borderedProminent)
                .tint(Brand.navy)
                .disabled(pendingImage == nil && noteText.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding()
        .background(isRequired ? Brand.red.opacity(0.08) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        .sheet(isPresented: $showingCamera) {
            ImagePicker(image: $pendingImage)
        }
    }

    private func saveAttachment() {
        Attachment.create(
            for: lineResult,
            photo: pendingImage,
            note: noteText.isEmpty ? nil : noteText,
            in: context
        )
        try? context.save()
        pendingImage = nil
        noteText = ""
    }
}
