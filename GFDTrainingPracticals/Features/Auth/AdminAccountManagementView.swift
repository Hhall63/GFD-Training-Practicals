import SwiftUI

/// Lets any logged-in admin create new admin accounts, deactivate old ones, or reset another
/// admin's password. There's no self-service "forgot password" flow possible without a
/// backend server, so "another admin resets it" is the supported recovery path by design.
struct AdminAccountManagementView: View {
    @Environment(\.managedObjectContext) private var context
    @FetchRequest(fetchRequest: AdminAccount.fetchActive()) private var admins: FetchedResults<AdminAccount>

    @State private var showingNewAdmin = false
    @State private var resettingAdmin: AdminAccount?

    var body: some View {
        List {
            ForEach(admins) { admin in
                VStack(alignment: .leading, spacing: 2) {
                    Text(admin.displayName).font(.headline)
                    Text("@\(admin.username)").font(.caption).foregroundStyle(.secondary)
                }
                .swipeActions {
                    Button("Deactivate", role: .destructive) {
                        admin.isActive = false
                        try? context.save()
                    }
                    Button("Reset Password") {
                        resettingAdmin = admin
                    }
                    .tint(Brand.navy)
                }
            }
        }
        .navigationTitle("Administrators")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Add", systemImage: "plus") { showingNewAdmin = true }
            }
        }
        .sheet(isPresented: $showingNewAdmin) {
            NewAdminSheet()
        }
        .sheet(item: $resettingAdmin) { admin in
            ResetPasswordSheet(admin: admin)
        }
    }
}

private struct NewAdminSheet: View {
    @Environment(\.managedObjectContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Full Name", text: $displayName)
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                SecureField("Temporary Password", text: $password)
            }
            .navigationTitle("New Administrator")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        AdminAccount.create(username: username, displayName: displayName, password: password, in: context)
                        try? context.save()
                        dismiss()
                    }
                    .disabled(displayName.isEmpty || username.isEmpty || password.count < 6)
                }
            }
        }
    }
}

private struct ResetPasswordSheet: View {
    let admin: AdminAccount
    @Environment(\.managedObjectContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var newPassword = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Reset password for \(admin.displayName)") {
                    SecureField("New Password (6+ characters)", text: $newPassword)
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        admin.passwordSalt = AdminAccount.generateSalt()
                        admin.passwordHash = AdminAccount.hashPassword(newPassword, salt: admin.passwordSalt)
                        try? context.save()
                        dismiss()
                    }
                    .disabled(newPassword.count < 6)
                }
            }
        }
    }
}
