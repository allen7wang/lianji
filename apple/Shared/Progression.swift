import Foundation

// MARK: - 估算 1RM（docs/data-contract.md §4）

enum StrengthMath {
    static let estimatedOneRepMaxRepsRange = 1...12

    /// Epley：`weight × (1 + reps / 30)`；reps = 1 时等于重量。只接受重量 > 0、1 ≤ reps ≤ 12。
    static func estimatedOneRepMax(weight: Double, reps: Int) -> Double? {
        guard weight.isFinite, weight > 0, estimatedOneRepMaxRepsRange.contains(reps) else { return nil }
        return reps == 1 ? weight : weight * (1 + Double(reps) / 30)
    }

    /// 只统计按次记录、已完成的正式组。
    static func estimatedOneRepMax(_ set: TrainingSet) -> Double? {
        guard set.completed, set.kind == .working, (set.unit ?? .reps) == .reps else { return nil }
        return estimatedOneRepMax(weight: set.weight, reps: set.reps)
    }
}

// MARK: - 加重建议（docs/data-contract.md §5）

enum ProgressionDecision: String, Hashable {
    case increase, hold, deload

    var label: String {
        switch self {
        case .increase: "加重"
        case .hold: "保持"
        case .deload: "减量"
        }
    }
}

enum ProgressionReason: String, Hashable {
    case allCompleted, missedLastTime, missedTwice

    var text: String {
        switch self {
        case .allCompleted: "上次全部完成"
        case .missedLastTime: "上次有未完成组"
        case .missedTwice: "连续两次未完成"
        }
    }
}

struct ProgressionSuggestion: Equatable {
    let exerciseId: String
    let decision: ProgressionDecision
    let reason: ProgressionReason
    /// 上次正式组的最大重量（kg）。
    let baseWeight: Double
    /// 建议重量（kg）。
    let suggestedWeight: Double
    /// 计划目标次数；没有计划或计划中已无该动作时为 nil（不比较次数）。
    let targetReps: Int?
    /// 作为依据的最近一次训练。
    let sourceWorkoutId: String

    var reasonText: String { reason.text }

    /// 例如「建议 62.5 kg · 上次全部完成」。
    func message(unit: WeightUnit) -> String {
        "建议 \(unit.format(kilograms: suggestedWeight)) · \(reason.text)"
    }
}

enum ProgressionAdvisor {
    /// 加重幅度：腿、全身动作更大。
    static func increment(for exercise: Exercise?, unit: WeightUnit) -> Double {
        let large = isLargeMuscleGroup(exercise)
        switch unit {
        case .kg: return large ? 5 : 2.5
        case .lb: return WeightUnit.lb.toKilograms(large ? 10 : 5)
        }
    }

    static func isLargeMuscleGroup(_ exercise: Exercise?) -> Bool {
        exercise?.muscle == "腿" || exercise?.muscle == "全身"
    }

    /// 减量：基准 × 0.9，kg 四舍五入到 2.5，lb 四舍五入到 5 lb，结果以 kg 返回。
    static func deloadWeight(from base: Double, unit: WeightUnit) -> Double {
        let step: Double = unit == .kg ? 2.5 : 5
        let value = unit.fromKilograms(base) * 0.9
        let rounded = unit.toKilograms((value / step).rounded() * step)
        return rounded > 0 ? rounded : base
    }

    /// 为某个动作生成加重建议；无可用依据（没有按次记录的已结束训练、上次重量为 0）时返回 nil。
    /// - Parameters:
    ///   - before: 只看在此时间之前开始的训练（通常传当前训练的开始时间）。
    ///   - excludingWorkoutId: 排除的训练（通常是当前训练）。
    static func suggestion(
        for exerciseId: String,
        exercise: Exercise?,
        workouts: [Workout],
        plans: [Plan],
        unit: WeightUnit = .kg,
        before: Date? = nil,
        excludingWorkoutId: String? = nil
    ) -> ProgressionSuggestion? {
        let sessions = workouts.filter { workout in
            workout.endedAt != nil && workout.id != excludingWorkoutId
                && (before.map { workout.startedAt <= $0 } ?? true)
                && workout.sets.contains { $0.exerciseId == exerciseId && $0.kind == .working }
        }.sorted { first, second in
            if first.startedAt != second.startedAt { return first.startedAt > second.startedAt }
            if first.endedAt != second.endedAt { return (first.endedAt ?? .distantPast) > (second.endedAt ?? .distantPast) }
            return first.id < second.id
        }
        guard let last = sessions.first else { return nil }
        let lastSets = repetitionSets(in: last, exerciseId: exerciseId)
        guard !lastSets.isEmpty else { return nil }
        let base = lastSets.map(\.weight).filter(\.isFinite).max() ?? 0
        guard base > 0 else { return nil }
        let target = targetReps(for: last, exerciseId: exerciseId, plans: plans)

        let decision: ProgressionDecision
        let reason: ProgressionReason
        let suggested: Double
        if isAchieved(lastSets, target: target) {
            decision = .increase
            reason = .allCompleted
            suggested = base + increment(for: exercise, unit: unit)
        } else if let previous = sessions.dropFirst().first,
                  case let previousSets = repetitionSets(in: previous, exerciseId: exerciseId), !previousSets.isEmpty,
                  !isAchieved(previousSets, target: targetReps(for: previous, exerciseId: exerciseId, plans: plans)) {
            decision = .deload
            reason = .missedTwice
            suggested = deloadWeight(from: base, unit: unit)
        } else {
            decision = .hold
            reason = .missedLastTime
            suggested = base
        }
        return ProgressionSuggestion(
            exerciseId: exerciseId,
            decision: decision,
            reason: reason,
            baseWeight: base,
            suggestedWeight: min(max(suggested, 0), 2000),
            targetReps: target,
            sourceWorkoutId: last.id
        )
    }

    /// 那次训练中该动作全部按次记录的正式组（含未完成组）。
    private static func repetitionSets(in workout: Workout, exerciseId: String) -> [TrainingSet] {
        workout.sets.filter { $0.exerciseId == exerciseId && $0.kind == .working && ($0.unit ?? .reps) == .reps }
    }

    private static func targetReps(for workout: Workout, exerciseId: String, plans: [Plan]) -> Int? {
        guard let planId = workout.planId, let plan = plans.first(where: { $0.id == planId }),
              let item = plan.items.first(where: { $0.exerciseId == exerciseId && ($0.unit ?? .reps) == .reps }),
              item.reps > 0 else { return nil }
        return item.reps
    }

    private static func isAchieved(_ sets: [TrainingSet], target: Int?) -> Bool {
        sets.allSatisfy { set in set.completed && (target.map { set.reps >= $0 } ?? true) }
    }
}
