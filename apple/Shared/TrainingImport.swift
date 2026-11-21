import Foundation

// MARK: - 合并导入（docs/data-contract.md §3）

struct TrainingMergeSummary: Equatable {
    var exercises = 0
    var plans = 0
    var workouts = 0
    var bodyEntries = 0
    var foodEntries = 0
    var scheduleEntries = 0
    var favorites = 0
    /// 备份中未结束、因此未导入的训练数。
    var skippedUnfinishedWorkouts = 0
    /// 本机未设置每周目标，采用了备份中的值。
    var adoptedWeeklyGoal = false
    /// 本机未设置的偏好字段采用了备份中的值。
    var adoptedPreferences = false

    var totalAdded: Int { exercises + plans + workouts + bodyEntries + foodEntries + scheduleEntries + favorites }

    /// 例如「新增 12 次训练、2 个计划、30 条身体记录。」
    var message: String {
        let parts = [
            (workouts, "次训练"),
            (plans, "个计划"),
            (bodyEntries, "条身体记录"),
            (foodEntries, "条饮食记录"),
            (exercises, "个动作"),
            (scheduleEntries, "项训练安排"),
            (favorites, "个收藏计划"),
        ].filter { $0.0 > 0 }.map { "\($0.0) \($0.1)" }
        var text = parts.isEmpty ? "没有需要合并的新记录" : "新增 " + parts.joined(separator: "、")
        if skippedUnfinishedWorkouts > 0 {
            text += "；跳过 \(skippedUnfinishedWorkouts) 次未结束的训练"
        }
        return text + "。"
    }
}

enum TrainingMerge {
    /// 纯函数：把备份合并进本机数据。备份会先做动作 ID 规范化。
    static func merge(local: AppState, backup: TrainingBackupFile) -> (state: AppState, summary: TrainingMergeSummary) {
        var incoming = backup.state
        incoming.normalizeExerciseIds()
        var next = local
        var summary = TrainingMergeSummary()

        // 动作：同 ID 跳过；自定义同名改用本机 ID；否则新增。
        var exerciseIds = Set(next.exercises.map(\.id))
        var localCustomByName: [String: String] = [:]
        for exercise in local.exercises where exercise.isCustom && localCustomByName[exercise.name] == nil {
            localCustomByName[exercise.name] = exercise.id
        }
        var exerciseMap: [String: String] = [:]
        for exercise in incoming.exercises {
            if exerciseIds.contains(exercise.id) { continue }
            if exercise.isCustom, let localId = localCustomByName[exercise.name] {
                exerciseMap[exercise.id] = localId
                continue
            }
            next.exercises.append(exercise)
            exerciseIds.insert(exercise.id)
            summary.exercises += 1
        }
        func mapped(_ id: String) -> String { exerciseMap[id] ?? id }

        // 计划：ID 不存在时连同条目一起新增；已存在保留本机版本。
        var planIds = Set(next.plans.map(\.id))
        var itemIds = Set(next.plans.flatMap { $0.items.map(\.id) })
        for plan in incoming.plans where !planIds.contains(plan.id) {
            var copy = plan
            copy.items = plan.items.map { item in
                var item = item
                item.exerciseId = mapped(item.exerciseId)
                if !itemIds.insert(item.id).inserted {
                    item.id = UUID().uuidString
                    itemIds.insert(item.id)
                }
                return item
            }
            next.plans.append(copy)
            planIds.insert(copy.id)
            summary.plans += 1
        }

        // 训练：只导入已结束的训练。
        var workoutIds = Set(next.workouts.map(\.id))
        var setIds = Set(next.workouts.flatMap { $0.sets.map(\.id) })
        for workout in incoming.workouts {
            guard workout.endedAt != nil else {
                summary.skippedUnfinishedWorkouts += 1
                continue
            }
            guard !workoutIds.contains(workout.id) else { continue }
            var copy = workout
            if let planId = copy.planId, !planIds.contains(planId) { copy.planId = nil }
            copy.sets = workout.sets.map { set in
                var set = set
                set.exerciseId = mapped(set.exerciseId)
                if !setIds.insert(set.id).inserted {
                    set.id = UUID().uuidString
                    setIds.insert(set.id)
                }
                return set
            }
            next.workouts.append(copy)
            workoutIds.insert(copy.id)
            summary.workouts += 1
        }

        // 身体 / 饮食：ID 不存在则新增。
        var bodyIds = Set(next.bodyEntries.map(\.id))
        for entry in incoming.bodyEntries where bodyIds.insert(entry.id).inserted {
            next.bodyEntries.append(entry)
            summary.bodyEntries += 1
        }
        var foodIds = Set(next.foodEntries.map(\.id))
        for entry in incoming.foodEntries where foodIds.insert(entry.id).inserted {
            next.foodEntries.append(entry)
            summary.foodEntries += 1
        }

        // 训练安排 / 收藏：取并集，只保留本机存在的计划。
        if let schedule = incoming.trainingSchedule {
            var merged = next.trainingSchedule ?? []
            var seen = Set(merged)
            for entry in schedule where planIds.contains(entry.planId) && seen.insert(entry).inserted {
                merged.append(entry)
                summary.scheduleEntries += 1
            }
            if summary.scheduleEntries > 0 { next.trainingSchedule = merged }
        }
        if let favorites = incoming.favoritePlanIds {
            var merged = next.favoritePlanIds ?? []
            var seen = Set(merged)
            for id in favorites where planIds.contains(id) && seen.insert(id).inserted {
                merged.append(id)
                summary.favorites += 1
            }
            if summary.favorites > 0 { next.favoritePlanIds = merged }
        }

        // 每周目标、偏好：本机已设置则保留，未设置（0 或缺省）时采用备份中的值。
        if next.weeklyGoalDays == nil, backup.preview.hasWeeklyGoal, let goal = incoming.weeklyGoalDays {
            next.weeklyGoalDays = goal
            summary.adoptedWeeklyGoal = true
        }
        if backup.preview.hasPreferences {
            let theirs = incoming.preferences
            if next.preferences.weightUnitSetting == nil, let unit = theirs.weightUnitSetting {
                next.preferences.weightUnitSetting = unit
                summary.adoptedPreferences = true
            }
            if next.preferences.calorieGoal == 0, theirs.calorieGoal > 0 {
                next.preferences.calorieGoal = theirs.calorieGoal
                summary.adoptedPreferences = true
            }
            if next.preferences.proteinGoal == 0, theirs.proteinGoal > 0 {
                next.preferences.proteinGoal = theirs.proteinGoal
                summary.adoptedPreferences = true
            }
        }
        return (next, summary)
    }
}

// MARK: - 导入快照与撤销

enum ImportSnapshotReason: String, Hashable {
    case replace, merge

    var label: String {
        switch self {
        case .replace: "替换恢复"
        case .merge: "合并导入"
        }
    }
}

struct ImportSnapshot: Identifiable, Hashable {
    let url: URL
    /// 快照写入时间（即导入发生的时间）。
    let createdAt: Date
    let reason: ImportSnapshotReason

    var id: String { url.lastPathComponent }
    /// 例如「11月21日 16:05 合并导入之前」。
    var label: String { "\(createdAt.formatted(date: .abbreviated, time: .shortened)) \(reason.label)之前" }
}

/// 快照保存在 Lianji 数据目录下的 `Snapshots/`，文件内容与备份格式相同，最多保留 3 份。
struct ImportSnapshotStore {
    static let limit = 3
    let directory: URL

    init(directory: URL) {
        self.directory = directory
    }

    /// 最新的在前。
    func list() -> [ImportSnapshot] {
        let urls = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return urls.compactMap(Self.snapshot).sorted { lhs, rhs in
            lhs.createdAt != rhs.createdAt ? lhs.createdAt > rhs.createdAt : lhs.id > rhs.id
        }
    }

    var latest: ImportSnapshot? { list().first }

    @discardableResult
    func save(_ data: Data, reason: ImportSnapshotReason, at date: Date = .now) throws -> ImportSnapshot {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var millis = Int64((date.timeIntervalSince1970 * 1000).rounded())
        if let newest = list().first {
            millis = max(millis, Int64((newest.createdAt.timeIntervalSince1970 * 1000).rounded()) + 1)
        }
        let url = directory.appendingPathComponent("snapshot-\(millis)-\(reason.rawValue).json")
        try data.write(to: url, options: .atomic)
        return ImportSnapshot(url: url, createdAt: Date(timeIntervalSince1970: Double(millis) / 1000), reason: reason)
    }

    /// 只保留最新的 `limit` 份。
    func prune(keeping limit: Int = ImportSnapshotStore.limit) {
        for snapshot in list().dropFirst(max(limit, 0)) {
            try? FileManager.default.removeItem(at: snapshot.url)
        }
    }

    func delete(_ snapshot: ImportSnapshot) {
        try? FileManager.default.removeItem(at: snapshot.url)
    }

    private static func snapshot(_ url: URL) -> ImportSnapshot? {
        guard url.pathExtension == "json" else { return nil }
        let parts = url.deletingPathExtension().lastPathComponent.split(separator: "-")
        guard parts.count == 3, parts[0] == "snapshot", let millis = Int64(parts[1]),
              let reason = ImportSnapshotReason(rawValue: String(parts[2])) else { return nil }
        return ImportSnapshot(url: url, createdAt: Date(timeIntervalSince1970: Double(millis) / 1000), reason: reason)
    }
}

enum ImportUndoError: LocalizedError {
    case noSnapshot
    case unreadable

    var errorDescription: String? {
        switch self {
        case .noSnapshot: "没有可撤销的导入。"
        case .unreadable: "快照文件已损坏，无法撤销上次导入。"
        }
    }
}
