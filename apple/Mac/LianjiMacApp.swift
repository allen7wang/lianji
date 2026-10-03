import SwiftUI

@main
struct LianjiMacApp: App {
    @StateObject private var store = TrainingStore()

    var body: some Scene {
        WindowGroup {
            MacRootView()
                .environmentObject(store)
                .frame(minWidth: 900, minHeight: 620)
                .preferredColorScheme(.dark)
        }
    }
}
