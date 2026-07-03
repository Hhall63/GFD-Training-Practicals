import Foundation

/// The three kinds of steps a test template can be built from, in the order the evaluator
/// works through them during a live test.
enum TestLineType: String, CaseIterable, Identifiable, Hashable {
    case instruction
    case graded
    case timer

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .instruction: return "Instruction"
        case .graded: return "Graded Step"
        case .timer: return "Timer"
        }
    }
}

enum ScoreMode: String, CaseIterable, Identifiable, Hashable {
    case passFail
    case points

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .passFail: return "Pass / Fail"
        case .points: return "Points"
        }
    }
}

enum LineResult: String {
    case pass
    case fail
    case notApplicable = "n/a"
}

enum SessionStatus: String {
    case inProgress
    case completed
    case abandoned
}

enum OverallResult: String {
    case pass
    case fail
}
