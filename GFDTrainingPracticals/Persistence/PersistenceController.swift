import CoreData

/// Wraps the Core Data + CloudKit stack for the whole app.
///
/// Every department device points at the same CloudKit private database (via one shared
/// department iCloud account), which is what lets test templates and results sync across
/// evaluator devices with no server and no ongoing cost. All reads/writes are local-first;
/// CloudKit sync happens transparently in the background.
struct PersistenceController {
    static let shared = PersistenceController()

    /// An in-memory store used for SwiftUI previews and unit tests, so preview code never
    /// touches the real CloudKit-backed database.
    static let preview: PersistenceController = {
        let controller = PersistenceController(inMemory: true)
        PreviewSeeder.seed(into: controller.container.viewContext)
        return controller
    }()

    let container: NSPersistentCloudKitContainer

    init(inMemory: Bool = false) {
        container = NSPersistentCloudKitContainer(name: "GFDModel")

        guard let description = container.persistentStoreDescriptions.first else {
            fatalError("GFDModel.xcdatamodeld is missing its persistent store description.")
        }

        if inMemory {
            description.url = URL(fileURLWithPath: "/dev/null")
        } else {
            // Required so CloudKit can tell us about changes made on other devices.
            description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
            description.setOption(true as NSNumber, forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)
        }

        container.loadPersistentStores { _, error in
            if let error {
                // A failure here almost always means the on-device store is corrupt or the
                // CloudKit schema hasn't been initialized yet (see CloudKitSchemaNotes.md).
                // Crashing loudly in development is preferable to silently losing recruit data.
                fatalError("Failed to load persistent store: \(error)")
            }
        }

        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }

    /// Saves the view context if there are pending changes. Safe to call liberally.
    func save() {
        let context = container.viewContext
        guard context.hasChanges else { return }
        do {
            try context.save()
        } catch {
            // Test-session data loss is the worst-case failure mode for this app, so this is
            // intentionally loud rather than silently swallowed.
            assertionFailure("Failed to save context: \(error)")
        }
    }
}
