import Foundation

@main
struct AppleProgramChecks {
    @MainActor
    static func main() throws {
        func check(_ value: @autoclosure () -> Bool, _ message: String) {
            precondition(value(), message)
        }
        check(TrainingProgram.catalog.count == 28, "program catalog")
        check(TrainingProgram.catalog.reduce(0) { $0 + $1.days.count } == 63, "training days")
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("lianji-store-check-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("training.json")
        var legacy = AppState.starter()
        legacy.exercises = Array(legacy.exercises.prefix(36))
        legacy.exercises.append(Exercise(id: "custom-beast", name: "兽式支撑", muscle: "自定义", equipment: "自定义", isCustom: true))
        legacy.plans[0].name = "保留我的编辑"
        legacy.plans[0].items[0].weight = 25
        legacy.workouts = [Workout(id: "saved-workout", name: "旧训练", endedAt: .now, note: "保留笔记", sets: [TrainingSet(id: "saved-set", exerciseId: "barbell_bench", setNumber: 1, weight: 20, reps: 7, completed: true)])]
        // Encode the old data shape, without the new optional fields.
        var raw = try JSONSerialization.jsonObject(with: JSONEncoder().encode(legacy)) as! [String: Any]
        raw["plans"] = (raw["plans"] as! [[String: Any]]).map { plan in
            var plan = plan
            plan["items"] = (plan["items"] as! [[String: Any]]).map { item in
                var item = item; item.removeValue(forKey: "unit"); item.removeValue(forKey: "restSeconds"); return item
            }
            return plan
        }
        try JSONSerialization.data(withJSONObject: raw).write(to: file)
        let store = TrainingStore(fileURL: file)
        check(store.state.exercises.count == 52, "append new builtins and preserve custom")
        check(store.state.plans.count == 3, "legacy plans retained")
        check(store.state.plans[0].name == "保留我的编辑" && store.state.plans[0].items[0].weight == 25, "legacy edits retained")
        check(store.state.workouts[0].note == "保留笔记" && store.state.workouts[0].volume == 140, "legacy history retained")
        check(store.state.exercises.first { $0.id == "custom-beast" }?.defaultUnit == .reps, "custom names keep their own unit")
        for program in TrainingProgram.catalog {
            let plans = try program.makePlans(exercises: store.state.exercises)
            check(plans.count == program.days.count, "all program actions resolve")
            check(plans.flatMap(\.items).allSatisfy { $0.reps > 0 && $0.sets > 0 && ($0.restSeconds ?? 90) <= 600 }, "valid targets")
        }
        let program = TrainingProgram.catalog.first { $0.id == "hiit-full-body" }!
        let imported = try store.importTemplate(program)
        check(imported == 2, "HIIT import")
        var edited = store.state.plans.first { $0.id == "template:hiit-full-body:a" }!
        edited.items[0].reps = 25; edited.items[0].restSeconds = 35
        store.savePlan(edited)
        let repeated = try store.importTemplate(program)
        check(repeated == 0, "repeat import retains edits")
        store.startWorkout(planId: edited.id)
        let first = store.activeWorkout!.sets[0]
        check(first.unit == .seconds && first.reps == 25 && first.restSeconds == 35, "workout copies edited duration and rest")
        store.addSet(for: first.exerciseId)
        let added = store.activeWorkout!.sets.last!
        check(added.unit == .seconds && added.reps == 25 && added.restSeconds == 35 && added.setNumber == 5, "additional set copies duration")
        store.updateSet(first.id, weight: 10, completed: true)
        check(store.activeWorkout!.volume == 0, "seconds do not inflate volume")
        let reopened = TrainingStore(fileURL: file)
        check(reopened.state.plans.count == 5 && reopened.activeWorkout!.sets[0].restSeconds == 35 && reopened.activeWorkout!.sets[0].completed, "persist and reopen")
        check(reopened.state.exercises.count == 52, "idempotent builtin upgrade")
        print("Passed: 28 programs / 63 days; legacy data, custom names, timed targets, rest, edited plans and workout persistence.")
    }
}
