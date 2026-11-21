import HealthKit
import SwiftUI

enum WatchHealth {
    static let store = HKHealthStore()

    static func requestAccess() async throws -> Bool {
        let workout = HKObjectType.workoutType()
        try await store.requestAuthorization(toShare: [workout], read: [])
        return store.authorizationStatus(for: workout) == .sharingAuthorized
    }

    static func save(_ workout: Workout) async throws {
        guard let end = workout.endedAt, end > workout.startedAt,
              DeviceSettings().healthSync, HKHealthStore.isHealthDataAvailable(),
              store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { return }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())
        try await builder.beginCollection(at: workout.startedAt)
        try await builder.addMetadata([HKMetadataKeyWorkoutBrandName: workout.name])
        try await builder.endCollection(at: end)
        _ = try await builder.finishWorkout()
    }
}

struct WatchHealthSetting: View {
    @AppStorage(DeviceSettings.Key.healthSync.rawValue) private var enabled = false
    @State private var requesting = false
    @State private var notice = false

    var body: some View {
        if HKHealthStore.isHealthDataAvailable() {
            Toggle("保存到健康", isOn: Binding(get: { enabled }, set: { value in
                if !value { enabled = false; return }
                requesting = true
                Task {
                    defer { requesting = false }
                    enabled = (try? await WatchHealth.requestAccess()) ?? false
                    notice = !enabled
                }
            }))
            .disabled(requesting)
            .alert("健康写入权限未开启", isPresented: $notice) {
                Button("好", role: .cancel) {}
            }
        }
    }
}
