import Combine
import CoreData
import Foundation

@MainActor
final class LiveTestRunnerViewModel: ObservableObject {
    let session: TestSession
    private let context: NSManagedObjectContext

    @Published private(set) var lineResults: [TestLineResult]
    @Published var currentIndex: Int = 0

    // Stopwatch state for the line currently on screen (or for a multi-line span, tracked
    // independently of which card is showing so the banner stays accurate).
    @Published private(set) var isTimerRunning = false
    @Published private(set) var elapsedSeconds: TimeInterval = 0
    private var timerStartDate: Date?
    private var ticker: AnyCancellable?

    init(session: TestSession, context: NSManagedObjectContext) {
        self.session = session
        self.context = context
        self.lineResults = session.lineResultsArray
    }

    var currentLineResult: TestLineResult? {
        guard lineResults.indices.contains(currentIndex) else { return nil }
        return lineResults[currentIndex]
    }

    var isOnLastLine: Bool {
        currentIndex == lineResults.count - 1
    }

    var progressText: String {
        "Line \(currentIndex + 1) of \(lineResults.count)"
    }

    /// Whether the evaluator can move past the current line: instructions always allow it;
    /// graded/timer lines require a result, and a Fail additionally requires attachment proof.
    func canAdvance() -> Bool {
        guard let line = currentLineResult else { return false }
        if line.lineTypeSnapshot == TestLineType.instruction.rawValue { return true }
        guard line.lineResult != nil else { return false }
        return line.hasRequiredEvidence
    }

    func startTimer() {
        timerStartDate = Date()
        isTimerRunning = true
        elapsedSeconds = 0
        ticker = Timer.publish(every: 0.1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self, let start = self.timerStartDate else { return }
                self.elapsedSeconds = Date().timeIntervalSince(start)
            }
    }

    /// Stops the running timer, writes the elapsed time, and auto-computes pass/fail against
    /// the line's stored threshold. The evaluator can still override the result afterward.
    func stopTimer() {
        guard let line = currentLineResult else { return }
        ticker?.cancel()
        ticker = nil
        isTimerRunning = false
        line.timerElapsedSeconds = elapsedSeconds
        line.lineResult = line.autoComputedTimerResult(elapsedSeconds: elapsedSeconds)
        save()
    }

    func setGradedResult(_ result: LineResult) {
        currentLineResult?.lineResult = result
        save()
    }

    func advance() {
        save()
        if isOnLastLine {
            session.finish()
        } else {
            currentIndex += 1
        }
        save()
    }

    func goBack() {
        guard currentIndex > 0 else { return }
        currentIndex -= 1
    }

    private func save() {
        try? context.save()
    }
}
