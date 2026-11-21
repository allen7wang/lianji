import Foundation
import Combine

@MainActor
final class TrainingStore: ObservableObject {
    @Published private(set) var state: AppState
    /// 最近一份导入前快照；为 nil 时没有可撤销的导入。
    @Published private(set) var latestSnapshot: ImportSnapshot?

    private let fileURL: URL
    private let snapshots: ImportSnapshotStore

    init(fileURL override: URL? = nil) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = override?.deletingLastPathComponent() ?? support.appendingPathComponent("Lianji", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = override ?? directory.appendingPathComponent("training.json")
        snapshots = ImportSnapshotStore(directory: directory.appendingPathComponent("Snapshots", isDirectory: true))
        if let data = try? Data(contentsOf: fileURL), let decoded = try? JSONDecoder().decode(AppState.self, from: data) {
            state = decoded
        } else {
            state = .starter()
        }
        state.normalizeExerciseIds()
        state.addMissingExercises()
        latestSnapshot = snapshots.latest
        try? persist(state)
    }

    var activeWorkout: Workout? { state.workouts.first { $0.endedAt == nil } }
    var finishedWorkouts: [Workout] { state.workouts.filter { $0.endedAt != nil }.sorted { $0.startedAt > $1.startedAt } }
    var orderedPlans: [Plan] {
        let favorites = Set(state.favoritePlanIds ?? [])
        return state.plans.filter { favorites.contains($0.id) } + state.plans.filter { !favorites.contains($0.id) }
    }

    func exercise(_ id: String) -> Exercise? { state.exercises.first { $0.id == id } }

    var preferences: AppPreferences { state.preferences }
    var weightUnit: WeightUnit { state.preferences.weightUnit }

    func isPlanFavorite(_ id: String) -> Bool { state.favoritePlanIds?.contains(id) == true }

    func togglePlanFavorite(_ id: String) throws {
        guard state.plans.contains(where: { $0.id == id }) else { throw PlanReuseError.missingPlan }
        var favorites = state.favoritePlanIds ?? []
        if favorites.contains(id) { favorites.removeAll { $0 == id } }
        else { favorites.append(id) }
        var next = state
        next.favoritePlanIds = favorites
        try commit(next)
    }

    @discardableResult
    func duplicatePlan(_ id: String) throws -> Plan {
        guard let source = state.plans.first(where: { $0.id == id }) else { throw PlanReuseError.missingPlan }
        let items = source.items.map { item in
            var copy = item
            copy.id = UUID().uuidString
            return copy
        }
        let copy = Plan(name: uniquePlanName("\(source.name) · 副本"), note: source.note, items: items)
        var next = state
        next.plans.append(copy)
        try commit(next)
        return copy
    }

    func setWeeklyGoal(_ days: Int?) throws {
        if let days, !(1...7).contains(days) { throw WeeklyGoalError.invalidDays }
        guard days != state.weeklyGoalDays else { return }
        var next = state
        next.weeklyGoalDays = days
        try commit(next)
    }

    func addExercise(name: String, muscle: String, equipment: String) {
        var next = state
        next.exercises.append(Exercise(id: UUID().uuidString, name: name, muscle: muscle, equipment: equipment, isCustom: true))
        updateState(next)
    }

    func savePlan(_ plan: Plan) {
        var next = state
        if let index = next.plans.firstIndex(where: { $0.id == plan.id }) {
            next.plans[index] = plan
        } else {
            next.plans.append(plan)
        }
        updateState(next)
    }

    @discardableResult
    func saveWorkoutAsPlan(_ id: String) throws -> Plan {
        guard let workout = state.workouts.first(where: { $0.id == id && $0.endedAt != nil }) else {
            throw WorkoutPlanError.unavailable
        }
        let completed = workout.completedWorkingSets.filter { $0.reps > 0 }
        let groups = Dictionary(grouping: completed, by: \.exerciseId)
        var seen = Set<String>()
        let items = completed.compactMap { set -> PlanItem? in
            guard seen.insert(set.exerciseId).inserted,
                  let exerciseSets = groups[set.exerciseId],
                  let last = exerciseSets.last else { return nil }
            let unit = last.unit ?? .reps
            let count = exerciseSets.filter { ($0.unit ?? .reps) == unit }.count
            return PlanItem(
                exerciseId: last.exerciseId,
                sets: min(count, 20),
                reps: min(last.reps, 1000),
                weight: min(max(last.weight, 0), 2000),
                unit: unit,
                restSeconds: min(max(last.restSeconds ?? 90, 0), 600)
            )
        }
        guard !items.isEmpty else { throw WorkoutPlanError.empty }

        let plan = Plan(name: uniquePlanName("\(workout.name) · 复练计划"), items: items)
        var next = state
        next.plans.append(plan)
        try commit(next)
        return plan
    }

    @discardableResult
    func importTemplate(_ program: TrainingProgram) throws -> Int {
        let plans = try program.makePlans(exercises: state.exercises)
        let pending = plans.filter { plan in !state.plans.contains { $0.id == plan.id } }
        guard !pending.isEmpty else { return 0 }
        var next = state
        next.plans.append(contentsOf: pending)
        updateState(next)
        return pending.count
    }

    func deletePlan(_ id: String) throws {
        var next = state
        next.plans.removeAll { $0.id == id }
        next.trainingSchedule?.removeAll { $0.planId == id }
        next.favoritePlanIds?.removeAll { $0 == id }
        for index in next.workouts.indices where next.workouts[index].planId == id {
            next.workouts[index].planId = nil
        }
        try commit(next)
    }

    @discardableResult
    func scheduleTraining(planId: String, on date: Date, now: Date = .now, timeZone: TimeZone = .current) throws -> Bool {
        guard state.plans.contains(where: { $0.id == planId }) else { throw ScheduleError.missingPlan }
        let day = ScheduledTraining.localDay(date, timeZone: timeZone)
        guard day >= ScheduledTraining.localDay(now, timeZone: timeZone) else { throw ScheduleError.pastDate }
        let entry = ScheduledTraining(planId: planId, day: day)
        var schedule = state.trainingSchedule ?? []
        guard !schedule.contains(entry) else { return false }
        schedule.append(entry)
        var next = state
        next.trainingSchedule = schedule
        try commit(next)
        return true
    }

    func cancelScheduledTraining(_ entry: ScheduledTraining) throws {
        guard state.trainingSchedule?.contains(entry) == true else { return }
        var next = state
        next.trainingSchedule?.removeAll { $0 == entry }
        try commit(next)
    }

    @discardableResult
    func startScheduledTraining(_ entry: ScheduledTraining) -> Bool {
        guard activeWorkout == nil, entry.day == ScheduledTraining.localDay(.now),
              state.trainingSchedule?.contains(entry) == true,
              state.plans.contains(where: { $0.id == entry.planId }) else { return false }
        startWorkout(planId: entry.planId)
        return true
    }

    func trainingSchedule(now: Date = .now, timeZone: TimeZone = .current) -> [TrainingScheduleItem] {
        guard let schedule = state.trainingSchedule, !schedule.isEmpty else { return [] }
        let today = ScheduledTraining.localDay(now, timeZone: timeZone)
        let completed = Set(state.workouts.compactMap { workout -> ScheduledTraining? in
            guard let planId = workout.planId, workout.endedAt != nil,
                  workout.sets.contains(where: \.completed) else { return nil }
            return ScheduledTraining(planId: planId, day: ScheduledTraining.localDay(workout.startedAt, timeZone: timeZone))
        })
        let plans = Dictionary(state.plans.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let items = schedule.compactMap { entry -> TrainingScheduleItem? in
            guard let plan = plans[entry.planId] else { return nil }
            let status: TrainingScheduleStatus
            if completed.contains(entry) { status = .completed }
            else if entry.day < today { status = .missed }
            else if entry.day == today { status = .pending }
            else { status = .upcoming }
            return TrainingScheduleItem(entry: entry, plan: plan, status: status)
        }
        return items.sorted { first, second in
            let firstPast = first.entry.day < today
            let secondPast = second.entry.day < today
            if firstPast != secondPast { return !firstPast }
            if first.entry.day == second.entry.day {
                return first.plan.name.localizedStandardCompare(second.plan.name) == .orderedAscending
            }
            return firstPast ? first.entry.day > second.entry.day : first.entry.day < second.entry.day
        }
    }

    func startWorkout(planId: String?) {
        guard activeWorkout == nil else { return }
        let plan = state.plans.first { $0.id == planId }
        let sets = plan?.items.flatMap { item in
            (1...max(1, item.sets)).map { number in
                TrainingSet(exerciseId: item.exerciseId, setNumber: number, weight: item.weight, reps: item.reps, unit: item.unit, restSeconds: item.restSeconds)
            }
        } ?? []
        var next = state
        next.workouts.append(Workout(planId: planId, name: plan?.name ?? "自由训练", note: plan?.note ?? "", sets: sets))
        updateState(next)
    }

    func addWorkoutExercise(_ exerciseId: String) {
        guard let active = activeWorkout, !active.sets.contains(where: { $0.exerciseId == exerciseId }) else { return }
        let unit = exercise(exerciseId)?.defaultUnit ?? .reps
        mutateActive { $0.sets.append(TrainingSet(exerciseId: exerciseId, setNumber: 1, weight: 0, reps: unit == .seconds ? 30 : 10, unit: unit, restSeconds: 90)) }
    }

    func exerciseReplacementRequest(workoutId: String, exerciseId: String) -> ExerciseReplacementRequest? {
        guard let workout = activeWorkout, workout.id == workoutId else { return nil }
        let rows = workout.sets.filter { $0.exerciseId == exerciseId }
        guard !rows.isEmpty, rows.allSatisfy({ !$0.completed }) else { return nil }
        return ExerciseReplacementRequest(workoutId: workoutId, exerciseId: exerciseId, setIds: rows.map(\.id))
    }

    func replaceWorkoutExercise(_ request: ExerciseReplacementRequest, with exerciseId: String) throws {
        guard let current = activeWorkout, current.id == request.workoutId,
              let refreshed = exerciseReplacementRequest(workoutId: request.workoutId, exerciseId: request.exerciseId),
              refreshed.setIds == request.setIds,
              let workoutIndex = state.workouts.firstIndex(where: { $0.id == current.id }) else {
            throw ExerciseReplacementError.unavailable
        }
        guard let exercise = exercise(exerciseId), exercise.id != request.exerciseId,
              !current.sets.contains(where: { $0.exerciseId == exerciseId }) else { throw ExerciseReplacementError.invalidTarget }
        let unit = exercise.defaultUnit
        var next = state
        next.workouts[workoutIndex].sets = current.sets.map { set in
            guard set.exerciseId == request.exerciseId else { return set }
            return TrainingSet(
                exerciseId: exerciseId,
                setNumber: set.setNumber,
                weight: 0,
                reps: unit == .seconds ? 30 : 10,
                unit: unit,
                restSeconds: set.restSeconds
            )
        }
        try commit(next)
    }

    func moveWorkoutExercise(workoutId: String, exerciseId: String, direction: Int, orderedExerciseIds: [String]) throws {
        guard direction == -1 || direction == 1 else { throw ExerciseOrderError.invalidDirection }
        guard let current = activeWorkout, current.id == workoutId,
              current.exerciseIds == orderedExerciseIds,
              let source = orderedExerciseIds.firstIndex(of: exerciseId),
              let workoutIndex = state.workouts.firstIndex(where: { $0.id == workoutId }) else {
            throw ExerciseOrderError.unavailable
        }
        let destination = source + direction
        guard orderedExerciseIds.indices.contains(destination) else { throw ExerciseOrderError.boundary }
        var order = orderedExerciseIds
        order.swapAt(source, destination)
        let groups = Dictionary(grouping: current.sets, by: \.exerciseId)
        var next = state
        next.workouts[workoutIndex].sets = order.flatMap { groups[$0, default: []] }
        try commit(next)
    }

    /// 追加一个正式组，沿用本动作最后一个正式组（没有时用最后一组）的目标。
    func addSet(for exerciseId: String) {
        guard let sets = activeWorkout?.sets,
              let previous = sets.last(where: { $0.exerciseId == exerciseId && $0.kind == .working })
                ?? sets.last(where: { $0.exerciseId == exerciseId }) else { return }
        let number = previous.kind == .working ? previous.setNumber + 1 : 1
        mutateActive { $0.sets.append(TrainingSet(exerciseId: exerciseId, setNumber: number, weight: previous.weight, reps: previous.reps, unit: previous.unit, restSeconds: previous.restSeconds)) }
    }

    /// 在本动作第一个正式组之前插入一个热身组：重量约为首个正式组的一半（按当前单位步长向下取整），次数与单位沿用。
    /// 返回新组 ID；当前训练中没有这个动作时返回 nil。
    @discardableResult
    func addWarmupSet(for exerciseId: String) -> String? {
        guard let sets = activeWorkout?.sets,
              let lastIndex = sets.lastIndex(where: { $0.exerciseId == exerciseId }) else { return nil }
        let firstWorking = sets.firstIndex { $0.exerciseId == exerciseId && $0.kind == .working }
        let reference = sets[firstWorking ?? lastIndex]
        let unit = weightUnit
        let weight: Double
        if reference.unit == .seconds {
            weight = reference.weight
        } else {
            let half = unit.fromKilograms(max(0, reference.weight)) / 2
            weight = unit.toKilograms((half / unit.step).rounded(.down) * unit.step)
        }
        let warmups = sets.filter { $0.exerciseId == exerciseId && $0.kind == .warmup }.count
        let set = TrainingSet(exerciseId: exerciseId, setNumber: warmups + 1, weight: weight, reps: reference.reps,
                              unit: reference.unit, restSeconds: reference.restSeconds, kind: .warmup)
        let index = firstWorking ?? lastIndex + 1
        mutateActive { $0.sets.insert(set, at: min(index, $0.sets.count)) }
        return set.id
    }

    /// 编辑时的输入上限：重量 0–2000 kg、次数 0–1000（导入不受此限制）。
    func updateSet(_ id: String, weight: Double? = nil, reps: Int? = nil, completed: Bool? = nil) {
        mutateActive { workout in
            guard let index = workout.sets.firstIndex(where: { $0.id == id }) else { return }
            if let weight, weight.isFinite { workout.sets[index].weight = min(max(0, weight), 2000) }
            if let reps { workout.sets[index].reps = min(max(0, reps), 1000) }
            if let completed { workout.sets[index].completed = completed }
        }
    }

    /// 在正式组与热身组之间切换（当前训练）。
    func toggleSetKind(_ id: String) {
        mutateActive { workout in
            guard let index = workout.sets.firstIndex(where: { $0.id == id }) else { return }
            workout.sets[index].kind = workout.sets[index].kind == .working ? .warmup : .working
        }
    }

    func setSetKind(_ id: String, _ kind: SetKind) {
        mutateActive { workout in
            guard let index = workout.sets.firstIndex(where: { $0.id == id }) else { return }
            workout.sets[index].kind = kind
        }
    }

    /// 设置或清除（nil）当前训练中某组的 RPE；只接受 5–10、步长 0.5。
    func setRPE(_ id: String, _ rpe: Double?) throws {
        if let rpe, !TrainingSet.isValidRPE(rpe) { throw SetEditError.invalidRPE }
        guard let workoutIndex = state.workouts.firstIndex(where: { $0.endedAt == nil }),
              let setIndex = state.workouts[workoutIndex].sets.firstIndex(where: { $0.id == id }) else { throw SetEditError.staleSet }
        guard state.workouts[workoutIndex].sets[setIndex].rpe != rpe else { return }
        var next = state
        next.workouts[workoutIndex].sets[setIndex].rpe = rpe
        try commit(next)
    }

    /// 当前单位下某个动作的加重建议（依据当前训练之前的已结束训练）。
    func progressionSuggestion(for exerciseId: String) -> ProgressionSuggestion? {
        let active = activeWorkout
        return ProgressionAdvisor.suggestion(
            for: exerciseId,
            exercise: exercise(exerciseId),
            workouts: state.workouts,
            plans: state.plans,
            unit: weightUnit,
            before: active?.startedAt,
            excludingWorkoutId: active?.id
        )
    }

    /// 把建议重量（kg）填入当前训练中该动作所有未完成的正式组，返回更新的组数。
    @discardableResult
    func applySuggestedWeight(_ weight: Double, to exerciseId: String) throws -> Int {
        guard weight.isFinite, (0...2000).contains(weight) else { throw ProgressionApplyError.invalidWeight }
        guard let workoutIndex = state.workouts.firstIndex(where: { $0.endedAt == nil }) else { throw ProgressionApplyError.unavailable }
        var next = state
        var updated = 0
        for index in next.workouts[workoutIndex].sets.indices {
            let set = next.workouts[workoutIndex].sets[index]
            guard set.exerciseId == exerciseId, set.kind == .working, !set.completed else { continue }
            next.workouts[workoutIndex].sets[index].weight = weight
            updated += 1
        }
        guard updated > 0 else { return 0 }
        try commit(next)
        return updated
    }

    @discardableResult
    func applySuggestion(_ suggestion: ProgressionSuggestion) throws -> Int {
        try applySuggestedWeight(suggestion.suggestedWeight, to: suggestion.exerciseId)
    }

    func reusePreviousSet(workoutId: String, setId: String, source: PreviousSetReference) throws {
        guard let workoutIndex = state.workouts.firstIndex(where: { $0.id == workoutId && $0.endedAt == nil }),
              state.workouts[workoutIndex].id == activeWorkout?.id else { throw ReusePreviousSetError.staleReference }
        let current = state.workouts[workoutIndex]
        guard let setIndex = current.sets.firstIndex(where: { $0.id == setId }) else { throw ReusePreviousSetError.staleReference }
        let set = current.sets[setIndex]
        let references = TrainingComparison(workouts: state.workouts).previousExerciseSets(for: current, exerciseId: set.exerciseId)
        guard let previous = references[set.exerciseId]?.first(where: { $0.unit == (set.unit ?? .reps) }),
              previous.reusableSet(for: set, in: current) == source else { throw ReusePreviousSetError.staleReference }
        var next = state
        next.workouts[workoutIndex].sets[setIndex].weight = source.set.weight
        next.workouts[workoutIndex].sets[setIndex].reps = source.set.reps
        try commit(next)
    }

    func deleteSet(_ id: String) { mutateActive { $0.sets.removeAll { $0.id == id } } }
    func updateNote(_ note: String) { mutateActive { $0.note = note } }
    func finishWorkout() { mutateActive { $0.endedAt = .now } }
    func discardWorkout() {
        var next = state
        next.workouts.removeAll { $0.endedAt == nil }
        updateState(next)
    }
    func deleteWorkout(_ id: String) {
        var next = state
        next.workouts.removeAll { $0.id == id }
        updateState(next)
    }

    func exportBackup(exportedAt: Date = .now) throws -> Data {
        try TrainingBackup.encode(state, exportedAt: exportedAt)
    }

    /// 替换恢复：先保存快照，再用备份替换本机数据。
    @discardableResult
    func restoreBackup(_ data: Data) throws -> TrainingBackupPreview {
        let parsed = try TrainingBackup.parse(data)
        try commitImport(replacementState(from: parsed), reason: .replace)
        return parsed.preview
    }

    /// 合并导入：先保存快照，再只添加本机没有的记录（docs/data-contract.md §3）。
    @discardableResult
    func mergeBackup(_ data: Data) throws -> TrainingMergeSummary {
        let parsed = try TrainingBackup.parse(data)
        var (next, summary) = TrainingMerge.merge(local: state, backup: parsed)
        next.addMissingExercises()
        try commitImport(next, reason: .merge)
        return summary
    }

    /// 全部导入前快照，最新的在前（最多 3 份）。
    var importSnapshots: [ImportSnapshot] { snapshots.list() }

    /// 撤销上次导入：用最近一份快照执行替换恢复（不再另存快照），然后删除这份快照。
    @discardableResult
    func undoLastImport() throws -> ImportSnapshot {
        guard let snapshot = snapshots.latest else {
            latestSnapshot = nil
            throw ImportUndoError.noSnapshot
        }
        let parsed: TrainingBackupFile
        do {
            parsed = try TrainingBackup.parse(Data(contentsOf: snapshot.url))
        } catch {
            throw ImportUndoError.unreadable
        }
        try commit(replacementState(from: parsed))
        snapshots.delete(snapshot)
        latestSnapshot = snapshots.latest
        return snapshot
    }

    private func replacementState(from parsed: TrainingBackupFile) -> AppState {
        var next = parsed.state
        if !parsed.preview.hasWeeklyGoal { next.weeklyGoalDays = state.weeklyGoalDays }
        if !parsed.preview.hasPreferences { next.preferences = state.preferences }
        next.normalizeExerciseIds()
        next.addMissingExercises()
        return next
    }

    private func commitImport(_ next: AppState, reason: ImportSnapshotReason) throws {
        let snapshot = try snapshots.save(TrainingBackup.encode(state), reason: reason)
        do {
            try commit(next)
        } catch {
            snapshots.delete(snapshot)
            throw error
        }
        snapshots.prune()
        latestSnapshot = snapshots.latest
    }

    func setPreferences(_ preferences: AppPreferences) throws {
        guard AppPreferences.calorieGoalRange.contains(preferences.calorieGoal) else { throw PreferencesError.invalidCalorieGoal }
        guard AppPreferences.proteinGoalRange.contains(preferences.proteinGoal) else { throw PreferencesError.invalidProteinGoal }
        guard preferences != state.preferences else { return }
        var next = state
        next.preferences = preferences
        try commit(next)
    }

    func setWeightUnit(_ unit: WeightUnit) throws {
        var preferences = state.preferences
        preferences.weightUnit = unit
        try setPreferences(preferences)
    }

    /// 0 表示关闭目标。
    func setCalorieGoal(_ kcal: Int) throws {
        var preferences = state.preferences
        preferences.calorieGoal = kcal
        try setPreferences(preferences)
    }

    /// 0 表示关闭目标。
    func setProteinGoal(_ grams: Int) throws {
        var preferences = state.preferences
        preferences.proteinGoal = grams
        try setPreferences(preferences)
    }

    func addBodyEntry(weight: Double, bodyFat: Double?) {
        var next = state
        next.bodyEntries.append(BodyEntry(weight: weight, bodyFat: bodyFat))
        updateState(next)
    }

    func addFoodEntry(_ entry: FoodEntry) {
        var next = state
        next.foodEntries.append(entry)
        updateState(next)
    }

    /// 最近吃过的食物（按 名称 + 份量 去重，最近一次在前，默认最多 8 条）。
    func recentFoods(limit: Int = FoodQuickAdd.defaultLimit) -> [FoodTemplate] {
        FoodQuickAdd.recent(state.foodEntries, limit: limit)
    }

    /// 常吃的食物（按记录次数，默认最多 8 条）。
    func frequentFoods(limit: Int = FoodQuickAdd.defaultLimit) -> [FoodTemplate] {
        FoodQuickAdd.frequent(state.foodEntries, limit: limit)
    }

    /// 把一条历史食物按原数值再记一次到指定餐次。
    @discardableResult
    func relogFood(_ template: FoodTemplate, meal: String, at date: Date = .now) throws -> FoodEntry {
        let entry = template.makeEntry(meal: meal, loggedAt: date)
        var next = state
        next.foodEntries.append(entry)
        try commit(next)
        return entry
    }

    /// 某天（默认今天）的营养合计与目标对照。
    func nutritionProgress(on date: Date = .now, timeZone: TimeZone = .current) -> NutritionGoalProgress {
        WellnessTrend.dailyNutrition(state.foodEntries, on: date, preferences: state.preferences, timeZone: timeZone)
    }

    private func mutateActive(_ change: (inout Workout) -> Void) {
        var next = state
        guard let index = next.workouts.firstIndex(where: { $0.endedAt == nil }) else { return }
        change(&next.workouts[index])
        updateState(next)
    }

    private func updateState(_ next: AppState) {
        state = next
        try? persist(next)
    }

    private func commit(_ next: AppState) throws {
        try persist(next)
        state = next
    }

    private func uniquePlanName(_ base: String) -> String {
        let names = Set(state.plans.map(\.name))
        var name = base
        var suffix = 2
        while names.contains(name) {
            name = "\(base)（\(suffix)）"
            suffix += 1
        }
        return name
    }

    private func persist(_ snapshot: AppState) throws {
        try JSONEncoder().encode(snapshot).write(to: fileURL, options: .atomic)
    }
}

enum PlanReuseError: Error {
    case missingPlan
}

enum ReusePreviousSetError: LocalizedError {
    case staleReference

    var errorDescription: String? {
        "当前组或上次记录已变化，请重新查看后重试。"
    }
}

enum ExerciseReplacementError: LocalizedError {
    case unavailable
    case invalidTarget

    var errorDescription: String? {
        switch self {
        case .unavailable: "训练或待练组已变化，请重新选择。"
        case .invalidTarget: "请选择训练中尚未添加的其他动作。"
        }
    }
}

enum ExerciseOrderError: LocalizedError {
    case invalidDirection
    case unavailable
    case boundary

    var errorDescription: String? {
        switch self {
        case .invalidDirection: "请选择上移或下移。"
        case .unavailable: "训练或动作顺序已变化，请重新查看后重试。"
        case .boundary: "这个动作已在当前顺序的边界。"
        }
    }
}

enum WeeklyGoalError: Error {
    case invalidDays
}

enum ScheduleError: LocalizedError {
    case missingPlan
    case pastDate

    var errorDescription: String? {
        switch self {
        case .missingPlan: "找不到这份训练计划。"
        case .pastDate: "请选择今天或之后的日期。"
        }
    }
}

enum SetEditError: LocalizedError {
    case staleSet
    case invalidRPE

    var errorDescription: String? {
        switch self {
        case .staleSet: "这一组已变化，请重新查看后重试。"
        case .invalidRPE: "RPE 需在 5–10 之间，以 0.5 为步长。"
        }
    }
}

enum ProgressionApplyError: LocalizedError {
    case unavailable
    case invalidWeight

    var errorDescription: String? {
        switch self {
        case .unavailable: "当前没有进行中的训练。"
        case .invalidWeight: "建议重量需在 0–2000 kg 之间。"
        }
    }
}

enum PreferencesError: LocalizedError {
    case invalidCalorieGoal
    case invalidProteinGoal

    var errorDescription: String? {
        switch self {
        case .invalidCalorieGoal: "热量目标需在 0–10000 kcal 之间，0 表示不设目标。"
        case .invalidProteinGoal: "蛋白质目标需在 0–1000 g 之间，0 表示不设目标。"
        }
    }
}

enum WorkoutPlanError: LocalizedError {
    case unavailable
    case empty

    var errorDescription: String? {
        switch self {
        case .unavailable: "找不到这次已保存的训练。"
        case .empty: "这次训练没有可存为计划的完成组。"
        }
    }
}
