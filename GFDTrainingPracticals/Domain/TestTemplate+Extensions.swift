import CoreData

extension TestTemplate {
    var linesArray: [TestLine] {
        (lines as? Set<TestLine>)?.sorted { $0.sortOrder < $1.sortOrder } ?? []
    }

    var gradedAndTimerLineCount: Int {
        linesArray.filter { $0.lineType != TestLineType.instruction.rawValue }.count
    }

    var sessionsArray: [TestSession] {
        (sessions as? Set<TestSession>)?.sorted { $0.startedAt > $1.startedAt } ?? []
    }

    @discardableResult
    static func create(name: String, description: String?, in context: NSManagedObjectContext) -> TestTemplate {
        let template = TestTemplate(context: context)
        template.id = UUID()
        template.name = name
        template.templateDescription = description
        template.version = 1
        template.isActive = true
        template.createdAt = Date()
        template.updatedAt = Date()
        return template
    }

    /// Appends a new line to the end of the template's sequence, keeping `sortOrder` contiguous.
    @discardableResult
    func addLine(type: TestLineType, text: String, in context: NSManagedObjectContext) -> TestLine {
        let line = TestLine(context: context)
        line.id = UUID()
        line.sortOrder = Int32(linesArray.count)
        line.lineType = type.rawValue
        line.lineText = text
        line.isScored = (type == .graded)
        line.template = self
        updatedAt = Date()
        return line
    }

    static func fetchActive() -> NSFetchRequest<TestTemplate> {
        let request = TestTemplate.fetchRequest()
        request.predicate = NSPredicate(format: "isActive == YES")
        request.sortDescriptors = [NSSortDescriptor(keyPath: \TestTemplate.name, ascending: true)]
        return request
    }
}
