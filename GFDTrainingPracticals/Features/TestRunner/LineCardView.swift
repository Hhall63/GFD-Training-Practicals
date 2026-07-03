import SwiftUI

struct LineCardView: View {
    @ObservedObject var viewModel: LiveTestRunnerViewModel
    let lineResult: TestLineResult

    var body: some View {
        switch lineResult.lineTypeSnapshot {
        case TestLineType.timer.rawValue:
            TimerLineCard(viewModel: viewModel, lineResult: lineResult)
        case TestLineType.graded.rawValue:
            GradedLineCard(viewModel: viewModel, lineResult: lineResult)
        default:
            InstructionLineCard(lineResult: lineResult)
        }
    }
}

private struct InstructionLineCard: View {
    @ObservedObject var lineResult: TestLineResult

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 40))
                .foregroundStyle(Brand.navy)
            Text(lineResult.lineTextSnapshot)
                .font(.title2.weight(.medium))
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
    }
}

private struct GradedLineCard: View {
    @ObservedObject var viewModel: LiveTestRunnerViewModel
    @ObservedObject var lineResult: TestLineResult

    var body: some View {
        VStack(spacing: 20) {
            Text(lineResult.lineTextSnapshot)
                .font(.title2.weight(.medium))
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            HStack(spacing: 16) {
                Button {
                    viewModel.setGradedResult(.pass)
                } label: {
                    Label("Pass", systemImage: "checkmark.circle.fill")
                }
                .brandPrimaryButton(color: lineResult.lineResult == .pass ? .green : Color(.systemGray4))

                Button {
                    viewModel.setGradedResult(.fail)
                } label: {
                    Label("Fail", systemImage: "xmark.circle.fill")
                }
                .brandPrimaryButton(color: lineResult.lineResult == .fail ? Brand.red : Color(.systemGray4))
            }
            .padding(.horizontal)

            if lineResult.lineResult != nil {
                AttachmentCaptureView(lineResult: lineResult, isRequired: lineResult.lineResult == .fail)
                    .padding(.horizontal)
            }
        }
    }
}

private struct TimerLineCard: View {
    @ObservedObject var viewModel: LiveTestRunnerViewModel
    @ObservedObject var lineResult: TestLineResult

    var body: some View {
        VStack(spacing: 20) {
            Text(lineResult.lineTextSnapshot)
                .font(.title2.weight(.medium))
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if let threshold = lineResult.passThresholdSecondsSnapshot?.doubleValue {
                Text("Pass: ≤ \(formatted(threshold))s")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }

            Text(formatted(viewModel.isTimerRunning ? viewModel.elapsedSeconds : (lineResult.timerElapsedSeconds ?? 0)))
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(viewModel.isTimerRunning ? .primary : (lineResult.lineResult == .fail ? Brand.red : .primary))

            if viewModel.isTimerRunning {
                Button("Stop") { viewModel.stopTimer() }
                    .brandPrimaryButton(color: Brand.red)
                    .padding(.horizontal)
            } else if lineResult.timerElapsedSeconds == nil {
                Button("Start") { viewModel.startTimer() }
                    .brandPrimaryButton()
                    .padding(.horizontal)
            } else {
                resultBadge
                HStack(spacing: 16) {
                    Button("Retry") { viewModel.startTimer() }
                        .buttonStyle(.bordered)
                    Button(lineResult.lineResult == .pass ? "Mark Fail Instead" : "Mark Pass Instead") {
                        viewModel.setGradedResult(lineResult.lineResult == .pass ? .fail : .pass)
                    }
                    .buttonStyle(.bordered)
                }

                if lineResult.lineResult != nil {
                    AttachmentCaptureView(lineResult: lineResult, isRequired: lineResult.lineResult == .fail)
                        .padding(.horizontal)
                }
            }
        }
    }

    private var resultBadge: some View {
        Label(
            lineResult.lineResult == .pass ? "PASS" : "FAIL",
            systemImage: lineResult.lineResult == .pass ? "checkmark.circle.fill" : "xmark.circle.fill"
        )
        .font(.title.weight(.bold))
        .foregroundStyle(lineResult.lineResult == .pass ? .green : Brand.red)
    }

    private func formatted(_ seconds: Double) -> String {
        String(format: "%.1f", seconds)
    }
}
