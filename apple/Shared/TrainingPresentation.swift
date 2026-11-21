import SwiftUI

struct TrainingPreferencesView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var notice: String?

    var body: some View {
        let preferences = store.state.preferences
        Picker("重量单位", selection: Binding(get: { preferences.weightUnit }, set: { unit in
            var next = preferences
            next.weightUnit = unit
            save(next)
        })) {
            Text("kg").tag(WeightUnit.kg)
            Text("lb").tag(WeightUnit.lb)
        }
        .alert("无法保存设置", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("好", role: .cancel) {}
        } message: { Text(notice ?? "") }
    }

    private func save(_ preferences: AppPreferences) {
        do { try store.setPreferences(preferences) }
        catch { notice = error.localizedDescription }
    }
}

struct SetKindAndRPE: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var showingOptions = false
    @State private var errorMessage: String?
    let set: TrainingSet

    var body: some View {
        Button { showingOptions = true } label: {
            Label(set.rpe.map { "RPE \($0.formatted())" } ?? "组次选项", systemImage: "ellipsis.circle")
        }
        .sheet(isPresented: $showingOptions) {
            List {
                Button(set.isWarmup ? "设为正式组" : "设为热身组") {
                    store.toggleSetKind(set.id)
                    showingOptions = false
                }
                Section("主观用力程度 RPE") {
                    if set.rpe != nil {
                        Button("清除 RPE") { saveRPE(nil) }
                    }
                    ForEach(TrainingSet.rpeOptions, id: \.self) { option in
                        Button("RPE \(option.formatted())") { saveRPE(option) }
                    }
                }
            }
            #if os(macOS)
            .frame(width: 300, height: 340)
            #endif
        }
        .alert("无法更新训练组", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("好", role: .cancel) {}
        } message: { Text(errorMessage ?? "") }
    }

    private func saveRPE(_ value: Double?) {
        showingOptions = false
        do { try store.setRPE(set.id, value) }
        catch { errorMessage = error.localizedDescription }
    }
}

struct TrainingSuggestionRow: View {
    @EnvironmentObject private var store: TrainingStore
    let exerciseId: String

    var body: some View {
        if let suggestion = store.progressionSuggestion(for: exerciseId),
           store.activeWorkout?.sets.contains(where: { $0.exerciseId == exerciseId && !$0.completed && !$0.isWarmup }) == true {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                let weight = store.state.preferences.weightUnit.format(kilograms: suggestion.suggestedWeight)
                Text("建议 \(weight)").themeText(.bodyStrong).foregroundStyle(Theme.Colors.data)
                Text(suggestion.reasonText).themeText(.caption).foregroundStyle(Theme.Colors.textMuted)
                Button("应用") { _ = try? store.applySuggestion(suggestion) }
                    .buttonStyle(.themeSecondary(.small))
            }
            .themeCard(padding: Theme.Spacing.sm)
        }
    }
}

struct NutritionGoalsSummary: View {
    let progress: NutritionGoalProgress

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            if let goal = progress.calorieGoal, let fraction = progress.calorieProgress {
                Text("热量 \(progress.calories.formatted()) / \(goal) 千卡").monospacedDigit()
                TraceProgress(value: fraction, tone: .data, label: "热量目标")
            }
            if let goal = progress.proteinGoal, let fraction = progress.proteinProgress {
                Text("蛋白质 \(progress.protein.formatted()) / \(goal) g").monospacedDigit()
                TraceProgress(value: fraction, tone: .data, label: "蛋白质目标")
            }
        }
    }
}
