import SwiftUI

/// Top-level router: shows the one-time admin setup flow on a brand-new install, the login
/// screen if nobody's signed in, or the Home Screen once an admin is logged in.
struct RootView: View {
    @EnvironmentObject private var session: SessionManager

    var body: some View {
        Group {
            if session.currentAdmin != nil {
                HomeView()
            } else if session.anyAdminExists() {
                LoginView()
            } else {
                SetupAdminView()
            }
        }
        .animation(.default, value: session.currentAdmin != nil)
    }
}
