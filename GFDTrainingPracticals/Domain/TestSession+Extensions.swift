import CoreData

extension TestSession {
    var sessionStatus: SessionStatus {
        get { SessionStatus(rawValue: status) ?? .inProgress }
        set { status = newValue.rawValue }
    }

    var result: OverallResult? {
        get { overallResult.flatMap(OverallResult.init) }
        set { overallResult = newValue?.rawValue }
    }

    var lineResultsArray: [TestLineResult] {
        (lineResults as? Set<TestLineResult>)?.sorted { $0.sortOrder < $1.sortOrder } ?? []
    }

    /// Creates a session with one placeholder `TestLineResult` per line in the template,
    /// snapshotting each line's text/type so later edits to the template never rewrite history.
    @discardableResult
    static func start(
        recruit: Recruit,
        template: TestTemplate,
        evaluatorName: String,
        in context: NSManagedObjectContext
    ) -> TestSession {
        let session = TestSession(context: context)
        session.id = UUID()
        session.startedAt = Date()
        session.sessionStatus = .inProgress
        session.evaluatorName = evaluatorName
        session.recruit = recruit
        session.template = template

        for line in template.linesArray {
            let lineResult = TestLineResult(context: context)
            lineResult.id = UUID()
            lineResult.sortOrder = line.sortOrder
            lineResult.lineTypeSnapshot = line.lineType
            lineResult.lineTextSnapshot = line.lineText
            lineResult.lineResult = (line.type == .instruction) ? .notApplicable : nil
            lineResult.passThresholdSecondsSnapshot = line.passThresholdSeconds
            lineResult.templateLine = line
            lineResult.session = session
        }

        return session
    }

    /// Recomputes and stores `overallResult`: fail if any graded/timer line failed, else pass.
    /// Call this whenever a line result changes and again when the session completes.
    func recomputeOverallResult() {
        let graded = lineResultsArray.filter { $0.lineTypeSnapshot != TestLineType.instruction.rawValue }
        guard graded.allSatisfy({ $0.lineResult != nil }) else {
            result = nil
            return
        }
        result = graded.contains { $0.lineResult == .fail } ? .fail : .pass
    }

    func finish() {
        recomputeOverallResult()
        completedAt = Date()
        sessionStatus = .completed
    }
}
