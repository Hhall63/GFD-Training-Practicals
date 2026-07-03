import SwiftUI

/// The reporting equivalent of the live-test Results screen, but read-only and reachable
/// any time later from Recruit History / Template reports rather than only right after a
/// test finishes.
struct ReadOnlySessionDetailView: View {
    @ObservedObject var session: TestSession

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Text(session.result == .pass ? "PASS" : "FAIL")
                        .font(.title.weight(.heavy))
                        .foregroundStyle(session.result == .pass ? .green : Brand.red)
                    Text(session.recruit?.fullName ?? "")
                        .font(.headline)
                    Text("\(session.template?.name ?? "") · \(session.startedAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Evaluator: \(session.evaluatorName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            Section("Steps") {
                ForEach(session.lineResultsArray, id: \.id) { lineResult in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(lineResult.lineTextSnapshot)
                            Spacer()
                            resultLabel(lineResult)
                        }
                        if let elapsed = lineResult.timerElapsedSeconds {
                            Text(String(format: "%.1fs", elapsed)).font(.caption).foregroundStyle(.secondary)
                        }
                        ForEach(lineResult.attachmentsArray, id: \.id) { attachment in
                            HStack {
                                if let image = attachment.photoImage {
                                    Image(uiImage: image).resizable().scaledToFill()
                                        .frame(width: 40, height: 40)
                                        .clipShape(RoundedRectangle(cornerRadius: 6))
                                }
                                if let note = attachment.noteText, !note.isEmpty {
                                    Text(note).font(.caption)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Session Detail")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func resultLabel(_ lineResult: TestLineResult) -> some View {
        switch lineResult.lineResult {
        case .pass: Text("Pass").foregroundStyle(.green)
        case .fail: Text("Fail").foregroundStyle(Brand.red)
        default: Text("—").foregroundStyle(.secondary)
        }
    }
}
