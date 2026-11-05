import SwiftUI

struct WeeklyGoalControl: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var saveFailed = false
    let activeDays: Int

    var body: some View {
        let goal = store.state.weeklyGoalDays
        Picker("目标天数", selection: Binding(
            get: { goal ?? 0 },
            set: { days in
                do { try store.setWeeklyGoal(days == 0 ? nil : days) }
                catch { saveFailed = true }
            }
        )) {
            Text("关闭").tag(0)
            ForEach(1...7, id: \.self) { day in Text("\(day) 天").tag(day) }
        }
        #if os(watchOS)
        .pickerStyle(.navigationLink)
        #else
        .pickerStyle(.menu)
        #endif
        .alert("无法保存每周目标", isPresented: $saveFailed) {
            Button("好", role: .cancel) {}
        } message: {
            Text("请重试。")
        }

        VStack(alignment: .leading, spacing: 6) {
            if let goal {
                Text("本周 \(activeDays) / \(goal) 天").font(.headline.monospacedDigit())
                ProgressView(value: Double(min(activeDays, goal)), total: Double(goal))
                    .accessibilityHidden(true)
                Text(activeDays >= goal ? "本周目标已达成" : "距目标还有 \(goal - activeDays) 天")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Text("本周已训练 \(activeDays) 天").font(.headline.monospacedDigit())
            }
            Text("周一至周日统计。每天至少完成并保存 1 组，同一天只计一次。")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
