import CoreData
import Foundation

/// Tracks who is currently logged in. The real access boundary is which department devices
/// are signed into the shared iCloud account (see CloudKitSchemaNotes.md); this login is a
/// lightweight, admin-assigned-credential layer on top of that, matching the plan's decision
/// to avoid needing a paid backend auth service.
@MainActor
final class SessionManager: ObservableObject {
    @Published private(set) var currentAdmin: AdminAccount?

    private let loggedInAdminIDKey = "loggedInAdminID"
    private let context: NSManagedObjectContext

    init(context: NSManagedObjectContext) {
        self.context = context
        restoreSession()
    }

    private func restoreSession() {
        guard let idString = Keychain.get(forKey: loggedInAdminIDKey),
              let id = UUID(uuidString: idString) else { return }

        let request = AdminAccount.fetchRequest()
        request.predicate = NSPredicate(format: "id == %@ AND isActive == YES", id as CVarArg)
        request.fetchLimit = 1
        currentAdmin = try? context.fetch(request).first
    }

    /// Returns true if any admin account exists yet. When false, the app shows the one-time
    /// "Setup Admin" flow instead of a login screen, since there's no server to seed an
    /// initial account from.
    func anyAdminExists() -> Bool {
        let request = AdminAccount.fetchRequest()
        request.fetchLimit = 1
        return (try? context.count(for: request)) ?? 0 > 0
    }

    @discardableResult
    func logIn(username: String, password: String) -> Bool {
        let request = AdminAccount.fetchRequest()
        request.predicate = NSPredicate(format: "username ==[c] %@ AND isActive == YES", username)
        request.fetchLimit = 1
        guard let account = try? context.fetch(request).first, account.matches(password: password) else {
            return false
        }
        account.lastLoginAt = Date()
        try? context.save()
        currentAdmin = account
        Keychain.set(account.id.uuidString, forKey: loggedInAdminIDKey)
        return true
    }

    func logOut() {
        currentAdmin = nil
        Keychain.remove(forKey: loggedInAdminIDKey)
    }
}
