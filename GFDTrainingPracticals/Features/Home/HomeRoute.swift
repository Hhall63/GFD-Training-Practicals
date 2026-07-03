import CoreData
import Foundation

/// `NSManagedObjectID` is already Hashable, but wrapping it keeps `HomeRoute`'s cases simple
/// to construct/read without importing CoreData everywhere this enum is used.
struct ManagedObjectIDBox: Hashable {
    let objectID: NSManagedObjectID
}

/// The screens reachable from the Home Screen, driven by a single NavigationStack path so
/// "Return to Home" (from the Results screen) can simply clear the path back to empty.
enum HomeRoute: Hashable {
    case recruitConfirm(templateID: ManagedObjectIDBox)
    case liveTest(sessionID: ManagedObjectIDBox)
    case results(sessionID: ManagedObjectIDBox)
}
