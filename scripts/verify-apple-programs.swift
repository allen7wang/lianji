import Foundation

@main
struct AppleProgramChecks {
    @MainActor
    static func main() throws {
        func check(_ value: @autoclosure () -> Bool, _ message: String) {
            precondition(value(), message)
        }
        check(TrainingProgram.catalog.count == 34, "program catalog")
        check(TrainingProgram.catalog.reduce(0) { $0 + $1.days.count } == 69, "training days")
        check(BreathingProfile.catalog.count == 4, "breathing profiles")
        let box = BreathingProfile.catalog.first { $0.id == "box_breathing" }!
        check([0.0, 4, 8, 12, 16].map { box.phase(at: $0).label } == ["吸气", "吸后停留", "呼气", "呼后停留", "吸气"], "breath phase boundaries")
        check(box.phase(at: 64).completedCycles == 4, "four box cycles")
        let gentle = BreathingProfile.catalog.first { $0.id == "diaphragmatic_breathing" }!
        check(gentle.phases.count == 2 && gentle.phase(at: 4).label == "呼气", "zero holds skipped")
        check(BreathingProfile.find(Exercise(id: "custom-breath", name: "腹式呼吸", muscle: "呼吸", equipment: "", isCustom: true)) == nil, "custom breathing names excluded")
        var clock = BreathingSession()
        clock.resume(at: Date(timeIntervalSince1970: 1)); clock.pause(at: Date(timeIntervalSince1970: 4))
        check(clock.elapsed(at: Date(timeIntervalSince1970: 100)) == 3000, "pause and background freeze")
        clock.resume(at: Date(timeIntervalSince1970: 110))
        check(clock.elapsed(at: Date(timeIntervalSince1970: 112)) == 5000, "resume keeps active progress")
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
        check(store.state.exercises.count == 56, "append new builtins and preserve custom")
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
        check(reopened.state.exercises.count == 56, "idempotent builtin upgrade")
        store.finishWorkout()
        let breathProgram = TrainingProgram.catalog.first { $0.id == "breathing-beginner" }!
        let breathImported = try store.importTemplate(breathProgram)
        check(breathImported == 1, "breath import")
        store.startWorkout(planId: "template:breathing-beginner:practice")
        let breathSet = store.activeWorkout!.sets[0]
        check(breathSet.unit == .seconds && breathSet.reps == 120 && breathSet.restSeconds == 0, "breath workout units and zero rest")
        check(!store.activeWorkout!.note.contains("单侧"), "breath notes exclude strength instructions")
        store.updateSet(breathSet.id, completed: true); store.finishWorkout()
        let breathReopened = TrainingStore(fileURL: file)
        let savedBreath = breathReopened.state.workouts.first { $0.planId == "template:breathing-beginner:practice" }!
        check(savedBreath.endedAt != nil && savedBreath.sets[0].completed && savedBreath.sets[0].reps == 120 && savedBreath.volume == 0, "breath history persists without weight volume")
        print("Passed: 34 programs / 69 days; legacy data, custom names, timed targets, rest, edited plans and workout persistence.")
    }
}
