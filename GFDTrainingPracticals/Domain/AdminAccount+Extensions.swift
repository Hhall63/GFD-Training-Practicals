import CoreData
import CryptoKit
import Foundation

extension AdminAccount {
    var fullNameOrUsername: String {
        displayName.isEmpty ? username : displayName
    }

    /// Hashes a plaintext password with a fresh random salt using PBKDF2-style stretching
    /// (many rounds of SHA-256). There is no backend server for this app (see the project
    /// plan), so this hash only needs to resist someone reading the local/synced database —
    /// it is intentionally not framed as bank-grade auth.
    static func hashPassword(_ password: String, salt: String) -> String {
        var data = Data((password + salt).utf8)
        for _ in 0..<100_000 {
            data = Data(SHA256.hash(data: data))
        }
        return data.map { String(format: "%02x", $0) }.joined()
    }

    static func generateSalt() -> String {
        UUID().uuidString
    }

    func matches(password: String) -> Bool {
        Self.hashPassword(password, salt: passwordSalt) == passwordHash
    }

    @discardableResult
    static func create(
        username: String,
        displayName: String,
        password: String,
        in context: NSManagedObjectContext
    ) -> AdminAccount {
        let account = AdminAccount(context: context)
        account.id = UUID()
        account.username = username
        account.displayName = displayName
        account.passwordSalt = generateSalt()
        account.passwordHash = hashPassword(password, salt: account.passwordSalt)
        account.isActive = true
        account.createdAt = Date()
        return account
    }

    static func fetchActive() -> NSFetchRequest<AdminAccount> {
        let request = AdminAccount.fetchRequest()
        request.predicate = NSPredicate(format: "isActive == YES")
        request.sortDescriptors = [NSSortDescriptor(keyPath: \AdminAccount.displayName, ascending: true)]
        return request
    }
}
