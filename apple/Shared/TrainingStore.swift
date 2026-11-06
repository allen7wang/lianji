import Foundation
import Combine

@MainActor
final class TrainingStore: ObservableObject {
    @Published private(set) var state: AppState

    private let fileURL: URL

    init(fileURL override: URL? = nil) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = override?.deletingLastPathComponent() ?? support.appendingPathComponent("Lianji", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = override ?? directory.appendingPathComponent("training.json")
        if let data = try? Data(contentsOf: fileURL), let decoded = try? JSONDecoder().decode(AppState.self, from: data) {
            state = decoded
        } else {
            state = .starter()
        }
        state.addMissingExercises()
        try? persist(state)
    }

    var activeWorkout: Workout? { state.workouts.first { $0.endedAt == nil } }
    var finishedWorkouts: [Workout] { state.workouts.filter { $0.endedAt != nil }.sorted { $0.startedAt > $1.startedAt } }
    var orderedPlans: [Plan] {
        let favorites = Set(state.favoritePlanIds ?? [])
        return state.plans.filter { favorites.contains($0.id) } + state.plans.filter { !favorites.contains($0.id) }
    }

    func exercise(_ id: String) -> Exercise? { state.exercises.first { $0.id == id } }

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
        let completed = workout.completedSets.filter { $0.reps > 0 }
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

    func addSet(for exerciseId: String) {
        guard let previous = activeWorkout?.sets.last(where: { $0.exerciseId == exerciseId }) else { return }
        mutateActive { $0.sets.append(TrainingSet(exerciseId: exerciseId, setNumber: previous.setNumber + 1, weight: previous.weight, reps: previous.reps, unit: previous.unit, restSeconds: previous.restSeconds)) }
    }

    func updateSet(_ id: String, weight: Double? = nil, reps: Int? = nil, completed: Bool? = nil) {
        mutateActive { workout in
            guard let index = workout.sets.firstIndex(where: { $0.id == id }) else { return }
            if let weight { workout.sets[index].weight = max(0, weight) }
            if let reps { workout.sets[index].reps = max(0, reps) }
            if let completed { workout.sets[index].completed = completed }
        }
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

    @discardableResult
    func restoreBackup(_ data: Data) throws -> TrainingBackupPreview {
        let parsed = try TrainingBackup.parse(data)
        var next = parsed.state
        if !parsed.preview.hasWeeklyGoal { next.weeklyGoalDays = state.weeklyGoalDays }
        next.addMissingExercises()
        try commit(next)
        return parsed.preview
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
