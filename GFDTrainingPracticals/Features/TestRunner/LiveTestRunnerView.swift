import SwiftUI

struct LiveTestRunnerView: View {
    @Binding var path: [HomeRoute]
    @Environment(\.managedObjectContext) private var context
    @StateObject private var viewModel: LiveTestRunnerViewModel

    init(session: TestSession, path: Binding<[HomeRoute]>) {
        _viewModel = StateObject(wrappedValue: LiveTestRunnerViewModel(session: session, context: session.managedObjectContext!))
        _path = path
    }

    var body: some View {
        VStack(spacing: 0) {
            if viewModel.isTimerRunning {
                timerBanner
            }

            ProgressView(value: Double(viewModel.currentIndex + 1), total: Double(viewModel.lineResults.count))
                .tint(Brand.gold)
                .padding(.horizontal)
                .padding(.top, 8)

            Text(viewModel.progressText)
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.top, 2)

            Spacer()

            if let lineResult = viewModel.currentLineResult {
                ScrollView {
                    LineCardView(viewModel: viewModel, lineResult: lineResult)
                        .padding()
                }
            }

            Spacer()

            HStack {
                if viewModel.currentIndex > 0 {
                    Button("Back") { viewModel.goBack() }
                        .buttonStyle(.bordered)
                }
                Spacer()
                Button(viewModel.isOnLastLine ? "Finish" : "Next") {
                    advance()
                }
                .brandPrimaryButton()
                .frame(maxWidth: 200)
                .disabled(!viewModel.canAdvance())
            }
            .padding()
        }
        .navigationTitle(viewModel.session.template?.name ?? "Test")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
        .interactiveDismissDisabled()
    }

    private var timerBanner: some View {
        HStack {
            Image(systemName: "timer")
            Text("Timer running: \(String(format: "%.1f", viewModel.elapsedSeconds))s")
            Spacer()
            Button("Stop") { viewModel.stopTimer() }
                .buttonStyle(.borderedProminent)
                .tint(Brand.red)
        }
        .padding()
        .background(Brand.navy)
        .foregroundStyle(.white)
    }

    private func advance() {
        if viewModel.isOnLastLine {
            path.append(.results(sessionID: ManagedObjectIDBox(objectID: viewModel.session.objectID)))
        }
        viewModel.advance()
    }
}
