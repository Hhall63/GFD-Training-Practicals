import SwiftUI

/// Shown exactly once, the very first time the app is used on a brand-new (empty) database,
/// since there's no server to seed an initial admin account from. This account can then
/// create every other admin/recruit/test going forward.
struct SetupAdminView: View {
    @EnvironmentObject private var session: SessionManager
    @Environment(\.managedObjectContext) private var context

    @State private var displayName = ""
    @State private var username = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    private var canSubmit: Bool {
        !displayName.isEmpty && !username.isEmpty
            && password.count >= 6 && password == confirmPassword
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Brand.badgeImage
                    .resizable()
                    .scaledToFit()
                    .frame(width: 120)
                    .padding(.top, 32)

                VStack(spacing: 4) {
                    Text("Welcome")
                        .font(.title.weight(.bold))
                    Text("Create the first administrator account for this department's app. This account can create everyone else's login afterward.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 32)

                VStack(spacing: 12) {
                    TextField("Your Name (e.g. Chief Alvarez)", text: $displayName)
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))

                    TextField("Username", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))

                    SecureField("Password (6+ characters)", text: $password)
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))

                    SecureField("Confirm Password", text: $confirmPassword)
                        .padding()
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))

                    Button("Create Admin Account") {
                        createAdmin()
                    }
                    .brandPrimaryButton()
                    .disabled(!canSubmit)
                }
                .padding(.horizontal, 32)
            }
        }
    }

    private func createAdmin() {
        let account = AdminAccount.create(
            username: username,
            displayName: displayName,
            password: password,
            in: context
        )
        try? context.save()
        session.logIn(username: account.username, password: password)
    }
}

#Preview {
    SetupAdminView()
        .environmentObject(SessionManager(context: PersistenceController.preview.container.viewContext))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
