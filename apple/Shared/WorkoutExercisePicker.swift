import SwiftUI

struct ReplaceWorkoutExerciseButton: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var pending: ExerciseReplacementRequest?
    let workoutId: String
    let exerciseId: String
    var onReplaced: (Exercise) -> Void = { _ in }

    var body: some View {
        if let request = store.exerciseReplacementRequest(workoutId: workoutId, exerciseId: exerciseId) {
            Button("更换待练动作", systemImage: "arrow.triangle.2.circlepath") { pending = request }
                .buttonStyle(.bordered)
                .accessibilityHint("选择其他动作并重设本组训练目标")
                .sheet(item: $pending) { request in
                    NavigationStack {
                        WorkoutExercisePicker(replacement: request, onReplaced: onReplaced)
                    }
                    #if os(macOS)
                    .frame(minWidth: 420, minHeight: 480)
                    #endif
                }
        }
    }
}

struct WorkoutExercisePicker: View {
    @EnvironmentObject private var store: TrainingStore
    @Environment(\.dismiss) private var dismiss
    @State private var selected: Exercise?
    @State private var failure: String?
    var replacement: ExerciseReplacementRequest?
    var onReplaced: (Exercise) -> Void = { _ in }

    var body: some View {
        let workout = store.activeWorkout
        let usedIds = Set(workout?.exerciseIds ?? [])
        let choices = store.state.exercises.filter { !usedIds.contains($0.id) }

        List {
            if workout == nil {
                Text("训练已结束，请返回。")
            } else if choices.isEmpty {
                Text("暂时没有其他可选动作。")
            } else {
                ForEach(choices) { exercise in
                    Button {
                        if replacement != nil { selected = exercise }
                        else {
                            store.addWorkoutExercise(exercise.id)
                            dismiss()
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(exercise.name)
                            Text("\(exercise.muscle) · \(exercise.equipment)")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationTitle(replacement == nil ? "选择动作" : "更换待练动作")
        .toolbar {
            if replacement != nil {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
            }
        }
        .confirmationDialog("更换待练动作？", isPresented: Binding(
            get: { selected != nil },
            set: { if !$0 { selected = nil } }
        ), titleVisibility: .visible, presenting: selected) { exercise in
            Button("确认更换") {
                guard let replacement else { return }
                do {
                    try store.replaceWorkoutExercise(replacement, with: exercise.id)
                    onReplaced(exercise)
                    dismiss()
                } catch {
                    failure = (error as? ExerciseReplacementError)?.localizedDescription ?? "保存失败，请重试。"
                }
            }
            Button("取消", role: .cancel) {}
        } message: { exercise in
            if let replacement {
                let source = store.exercise(replacement.exerciseId)?.name ?? "当前动作"
                let target = exercise.defaultUnit == .seconds ? "30 秒" : "10 次"
                Text("将「\(source)」的 \(replacement.setIds.count) 组更换为「\(exercise.name)」。保留顺序、组号和休息，重量设为 0 kg，每组目标设为 \(target)。")
            }
        }
        .alert("无法更换动作", isPresented: Binding(
            get: { failure != nil },
            set: { if !$0 { failure = nil } }
        )) {
            Button("好", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }
}
