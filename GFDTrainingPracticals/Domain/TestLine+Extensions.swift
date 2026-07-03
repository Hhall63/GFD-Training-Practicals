import Foundation

extension TestLine {
    var type: TestLineType {
        get { TestLineType(rawValue: lineType) ?? .instruction }
        set { lineType = newValue.rawValue }
    }

    var mode: ScoreMode? {
        get { scoreMode.flatMap(ScoreMode.init) }
        set { scoreMode = newValue?.rawValue }
    }

    /// Whether this line is the *start* of a multi-line timer span (as opposed to a
    /// single-line timer that starts and stops on the same line).
    var spansMultipleLines: Bool {
        guard let start = timerStartsAtLineOrder?.int32Value,
              let stop = timerStopsAtLineOrder?.int32Value else { return false }
        return stop > start
    }
}
