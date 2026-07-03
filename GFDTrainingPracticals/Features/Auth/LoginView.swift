import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: SessionManager

    @State private var username = ""
    @State private var password = ""
    @State private var showError = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Brand.badgeImage
                .resizable()
                .scaledToFit()
                .frame(width: 140)

            VStack(spacing: 4) {
                Text("GFD Recruit Testing")
                    .font(.title2.weight(.bold))
                Text("Greensboro Fire Department")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 12) {
                TextField("Username", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .textContentType(.username)
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 10))

                if showError {
                    Text("Incorrect username or password.")
                        .font(.footnote)
                        .foregroundStyle(Brand.red)
                }

                Button("Sign In") {
                    attemptLogin()
                }
                .brandPrimaryButton()
                .disabled(username.isEmpty || password.isEmpty)
            }
            .padding(.horizontal, 32)

            Spacer()
            Spacer()

            Text("Accounts are created by a department administrator.\nContact your admin if you need access or a password reset.")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.bottom, 24)
        }
        .padding()
    }

    private func attemptLogin() {
        showError = !session.logIn(username: username, password: password)
        if showError {
            password = ""
        }
    }
}

#Preview {
    LoginView()
        .environmentObject(SessionManager(context: PersistenceController.preview.container.viewContext))
}
