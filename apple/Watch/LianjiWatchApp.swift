import SwiftUI

@main
struct LianjiWatchApp: App {
    @StateObject private var store = TrainingStore()

    var body: some Scene {
        WindowGroup {
            WatchHomeView()
                .environmentObject(store)
                .tint(Color(red: 0.725, green: 0.953, blue: 0.416))
        }
    }
}
