import Foundation
import Combine

@MainActor
final class TrainingStore: ObservableObject {
    @Published private(set) var state: AppState {
        didSet { save() }
    }

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
        save()
    }

    var activeWorkout: Workout? { state.workouts.first { $0.endedAt == nil } }
    var finishedWorkouts: [Workout] { state.workouts.filter { $0.endedAt != nil }.sorted { $0.startedAt > $1.startedAt } }

    func exercise(_ id: String) -> Exercise? { state.exercises.first { $0.id == id } }

    func addExercise(name: String, muscle: String, equipment: String) {
        var next = state
        next.exercises.append(Exercise(id: UUID().uuidString, name: name, muscle: muscle, equipment: equipment, isCustom: true))
        state = next
    }

    func savePlan(_ plan: Plan) {
        var next = state
        if let index = next.plans.firstIndex(where: { $0.id == plan.id }) {
            next.plans[index] = plan
        } else {
            next.plans.append(plan)
        }
        state = next
    }

    @discardableResult
    func importTemplate(_ program: TrainingProgram) throws -> Int {
        let plans = try program.makePlans(exercises: state.exercises)
        let pending = plans.filter { plan in !state.plans.contains { $0.id == plan.id } }
        guard !pending.isEmpty else { return 0 }
        var next = state
        next.plans.append(contentsOf: pending)
        state = next
        return pending.count
    }

    func deletePlan(_ id: String) {
        var next = state
        next.plans.removeAll { $0.id == id }
        state = next
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
        state = next
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

    func deleteSet(_ id: String) { mutateActive { $0.sets.removeAll { $0.id == id } } }
    func updateNote(_ note: String) { mutateActive { $0.note = note } }
    func finishWorkout() { mutateActive { $0.endedAt = .now } }
    func discardWorkout() {
        var next = state
        next.workouts.removeAll { $0.endedAt == nil }
        state = next
    }
    func deleteWorkout(_ id: String) {
        var next = state
        next.workouts.removeAll { $0.id == id }
        state = next
    }

    func addBodyEntry(weight: Double, bodyFat: Double?) {
        var next = state
        next.bodyEntries.append(BodyEntry(weight: weight, bodyFat: bodyFat))
        state = next
    }

    func addFoodEntry(_ entry: FoodEntry) {
        var next = state
        next.foodEntries.append(entry)
        state = next
    }

    private func mutateActive(_ change: (inout Workout) -> Void) {
        var next = state
        guard let index = next.workouts.firstIndex(where: { $0.endedAt == nil }) else { return }
        change(&next.workouts[index])
        state = next
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
