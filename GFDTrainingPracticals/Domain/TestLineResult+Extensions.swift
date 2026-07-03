import CoreData

extension TestLineResult {
    var lineResult: LineResult? {
        get { result.flatMap(LineResult.init) }
        set { result = newValue?.rawValue }
    }

    var attachmentsArray: [Attachment] {
        (attachments as? Set<Attachment>)?.sorted { $0.capturedAt < $1.capturedAt } ?? []
    }

    /// A Fail result requires proof (photo and/or note); a Pass does not.
    var hasRequiredEvidence: Bool {
        guard lineResult == .fail else { return true }
        return !attachmentsArray.isEmpty
    }

    /// Compares an elapsed timer reading against the pass/fail cutoff captured when this
    /// session started, so the evaluator never has to do the math themselves.
    func autoComputedTimerResult(elapsedSeconds: Double) -> LineResult {
        guard let threshold = passThresholdSecondsSnapshot?.doubleValue else { return .pass }
        return elapsedSeconds <= threshold ? .pass : .fail
    }
}
