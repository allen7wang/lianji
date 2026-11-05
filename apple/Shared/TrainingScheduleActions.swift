import SwiftUI

struct TrainingScheduleActions: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var confirming = false
    @State private var cancelFailed = false
    let item: TrainingScheduleItem
    var onStart: () -> Void = {}

    var body: some View {
        #if os(watchOS)
        VStack(alignment: .leading, spacing: 6) { actions }
        #else
        HStack(spacing: 10) { actions }
        #endif
    }

    @ViewBuilder private var actions: some View {
        if item.status == .pending {
            Button("开始训练", systemImage: "play.fill") {
                if store.startScheduledTraining(item.entry) { onStart() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.activeWorkout != nil)
        }
        Button("取消安排", role: .destructive) { confirming = true }
            .buttonStyle(.bordered)
            .confirmationDialog("取消这项训练安排？", isPresented: $confirming, titleVisibility: .visible) {
                Button("取消安排", role: .destructive) {
                    do { try store.cancelScheduledTraining(item.entry) }
                    catch { cancelFailed = true }
                }
                Button("保留安排", role: .cancel) {}
            } message: {
                Text("\(item.entry.day) · \(item.plan.name)")
            }
            .alert("无法取消训练安排", isPresented: $cancelFailed) {
                Button("好", role: .cancel) {}
            } message: {
                Text("请重试。")
            }
    }
}
