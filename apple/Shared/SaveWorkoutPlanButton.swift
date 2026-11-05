import SwiftUI

struct SaveWorkoutPlanButton: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var confirming = false
    @State private var feedback: String?
    let workout: Workout

    var body: some View {
        if workout.completedSets.contains(where: { $0.reps > 0 }) {
            VStack(alignment: .leading, spacing: 4) {
                Button("存为训练计划", systemImage: "doc.on.doc") {
                    confirming = true
                }
                .confirmationDialog("存为训练计划？", isPresented: $confirming, titleVisibility: .visible) {
                    Button("保存计划") {
                        do {
                            let plan = try store.saveWorkoutAsPlan(workout.id)
                            feedback = "已保存「\(plan.name)」"
                        } catch let error as WorkoutPlanError {
                            feedback = error.localizedDescription
                        } catch {
                            feedback = "无法保存训练计划，请重试。"
                        }
                    }
                    Button("取消", role: .cancel) {}
                } message: {
                    Text("复制有效的完成组，以每个动作最后一组的单位和目标为准。超过计划上限的数值按上限保存。")
                }
                if let feedback {
                    Text(feedback).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }
}
