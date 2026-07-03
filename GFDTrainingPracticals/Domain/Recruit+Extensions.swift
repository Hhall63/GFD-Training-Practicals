import CoreData
import UIKit

extension Recruit {
    var fullName: String { "\(firstName) \(lastName)" }

    var photoImage: UIImage? {
        get { photo.flatMap(UIImage.init) }
        set { photo = newValue?.jpegData(compressionQuality: 0.7) }
    }

    var sessionsArray: [TestSession] {
        (sessions as? Set<TestSession>)?.sorted { $0.startedAt > $1.startedAt } ?? []
    }

    @discardableResult
    static func create(
        firstName: String,
        lastName: String,
        cohort: String,
        badgeNumber: String?,
        in context: NSManagedObjectContext
    ) -> Recruit {
        let recruit = Recruit(context: context)
        recruit.id = UUID()
        recruit.firstName = firstName
        recruit.lastName = lastName
        recruit.recruitClassOrCohort = cohort
        recruit.badgeOrIdNumber = badgeNumber
        recruit.isActive = true
        recruit.createdAt = Date()
        return recruit
    }

    static func fetchActive() -> NSFetchRequest<Recruit> {
        let request = Recruit.fetchRequest()
        request.predicate = NSPredicate(format: "isActive == YES")
        request.sortDescriptors = [
            NSSortDescriptor(keyPath: \Recruit.lastName, ascending: true),
            NSSortDescriptor(keyPath: \Recruit.firstName, ascending: true)
        ]
        return request
    }
}
