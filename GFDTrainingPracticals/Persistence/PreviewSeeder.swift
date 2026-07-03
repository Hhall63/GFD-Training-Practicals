import CoreData

/// Populates an in-memory store with sample data so SwiftUI previews and screenshots show
/// something realistic without touching the real CloudKit-backed database.
enum PreviewSeeder {
    static func seed(into context: NSManagedObjectContext) {
        let admin = AdminAccount.create(
            username: "chief.admin",
            displayName: "Chief Administrator",
            password: "changeme",
            in: context
        )
        admin.lastLoginAt = Date()

        let recruit = Recruit.create(
            firstName: "Jordan",
            lastName: "Alvarez",
            cohort: "Academy Class 2026-A",
            badgeNumber: "R-104",
            in: context
        )

        let template = TestTemplate.create(
            name: "Ladder Raise Evolution",
            description: "Single-firefighter 24' extension ladder raise against a structure.",
            in: context
        )
        template.addLine(type: .instruction, text: "Recruit stages the ladder at the building, tools in hand.", in: context)
        let graded = template.addLine(type: .graded, text: "Ladder is footed and angled correctly before raise.", in: context)
        graded.mode = .passFail
        let timer = template.addLine(type: .timer, text: "Total time to raise and extend ladder to the roofline.", in: context)
        timer.passThresholdSeconds = 45

        let session = TestSession.start(recruit: recruit, template: template, evaluatorName: admin.displayName, in: context)
        for lineResult in session.lineResultsArray {
            if lineResult.lineTypeSnapshot == TestLineType.timer.rawValue {
                lineResult.timerElapsedSeconds = 38.2
                lineResult.lineResult = .pass
            } else if lineResult.lineTypeSnapshot == TestLineType.graded.rawValue {
                lineResult.lineResult = .pass
            }
        }
        session.finish()

        try? context.save()
    }
}
