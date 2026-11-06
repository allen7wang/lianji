import SwiftUI

struct WorkoutExerciseOrderControls: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var failure: String?
    let workoutId: String
    let exerciseId: String
    let orderedExerciseIds: [String]

    var body: some View {
        let position = orderedExerciseIds.firstIndex(of: exerciseId)
        let name = store.exercise(exerciseId)?.name ?? "当前动作"
        HStack(spacing: 6) {
            Button("上移", systemImage: "arrow.up") { move(-1) }
                .disabled(position == nil || position == 0)
                .accessibilityLabel("上移\(name)")
            Button("下移", systemImage: "arrow.down") { move(1) }
                .disabled(position == nil || position == orderedExerciseIds.count - 1)
                .accessibilityLabel("下移\(name)")
        }
        .font(.caption)
        .buttonStyle(.bordered)
        .accessibilityHint("调整当前训练的动作组顺序")
        .alert("无法调整动作顺序", isPresented: Binding(
            get: { failure != nil },
            set: { if !$0 { failure = nil } }
        )) {
            Button("好", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }

    private func move(_ direction: Int) {
        do {
            try store.moveWorkoutExercise(
                workoutId: workoutId,
                exerciseId: exerciseId,
                direction: direction,
                orderedExerciseIds: orderedExerciseIds
            )
        } catch let error as ExerciseOrderError {
            failure = error.localizedDescription
        } catch {
            failure = "保存失败，请重试。"
        }
    }
}
