import SwiftUI

/// Shown once every line in a live test has been completed. Shows the auto-calculated
/// overall Pass/Fail plus a line-by-line breakdown, and lets the evaluator return to the
/// Home Screen to start the next recruit's test.
struct SessionResultsView: View {
    @ObservedObject var session: TestSession
    @Binding var path: [HomeRoute]

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                overallBadge
                    .padding(.top, 24)

                if let recruit = session.recruit {
                    Text(recruit.fullName)
                        .font(.title2.weight(.semibold))
                    Text(session.template?.name ?? "")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 8) {
                    ForEach(session.lineResultsArray, id: \.id) { lineResult in
                        lineRow(lineResult)
                    }
                }
                .padding(.horizontal)

                Button("Return to Home") {
                    path.removeAll()
                }
                .brandPrimaryButton()
                .padding(.horizontal, 32)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .navigationTitle("Results")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .interactiveDismissDisabled()
    }

    private var overallBadge: some View {
        VStack(spacing: 8) {
            Image(systemName: session.result == .pass ? "checkmark.seal.fill" : "xmark.seal.fill")
                .font(.system(size: 64))
                .foregroundStyle(session.result == .pass ? .green : Brand.red)
            Text(session.result == .pass ? "PASS" : "FAIL")
                .font(.system(size: 40, weight: .heavy, design: .rounded))
                .foregroundStyle(session.result == .pass ? .green : Brand.red)
        }
    }

    private func lineRow(_ lineResult: TestLineResult) -> some View {
        HStack(alignment: .top) {
            icon(for: lineResult)
            VStack(alignment: .leading, spacing: 2) {
                Text(lineResult.lineTextSnapshot)
                    .font(.subheadline)
                if let elapsed = lineResult.timerElapsedSeconds {
                    Text(String(format: "%.1fs", elapsed))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if !lineResult.attachmentsArray.isEmpty {
                    Text("\(lineResult.attachmentsArray.count) attachment(s)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func icon(for lineResult: TestLineResult) -> some View {
        switch lineResult.lineResult {
        case .pass:
            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case .fail:
            Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.red)
        default:
            Image(systemName: "info.circle").foregroundStyle(.secondary)
        }
    }
}
