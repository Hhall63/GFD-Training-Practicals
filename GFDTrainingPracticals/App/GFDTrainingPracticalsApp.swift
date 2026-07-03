import SwiftUI

@main
struct GFDTrainingPracticalsApp: App {
    let persistence = PersistenceController.shared
    @StateObject private var session: SessionManager

    init() {
        let context = persistence.container.viewContext
        _session = StateObject(wrappedValue: SessionManager(context: context))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(\.managedObjectContext, persistence.container.viewContext)
                .environmentObject(session)
                .tint(Brand.navy)
        }
    }
}
