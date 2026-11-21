import SwiftUI

@main
struct LianjiWatchApp: App {
    @StateObject private var store = TrainingStore()

    var body: some Scene {
        WindowGroup {
            WatchHomeView()
                .environmentObject(store)
                .tint(Theme.Colors.accent)
                .preferredColorScheme(.dark)
        }
    }
}
