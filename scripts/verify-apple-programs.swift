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
        check(store.state.weeklyGoalDays == nil, "weekly goal defaults off for legacy data")
        check(store.trainingSchedule().isEmpty, "training schedule starts empty for legacy data")
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
        checkProgress()
        try checkSaveAsPlan(in: directory)
        try checkWeeklyGoal(in: directory)
        try checkSchedule(in: directory)
        checkComparisons()
        print("Passed: 34 programs / 69 days; legacy data, timed targets, workout persistence, progress, copying history to plans, weekly goals, schedules and training comparisons.")
    }

    static func checkProgress() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let monday = calendar.date(from: DateComponents(year: 2026, month: 3, day: 2))!
        let sunday = calendar.date(byAdding: .day, value: 6, to: monday)!
        let nextMonday = calendar.date(byAdding: .day, value: 7, to: monday)!
        let weighted = Workout(id: "weighted", name: "力量", startedAt: monday, endedAt: monday, sets: [
            TrainingSet(exerciseId: "barbell_bench", setNumber: 1, weight: 30, reps: 5, completed: true),
            TrainingSet(exerciseId: "barbell_bench", setNumber: 2, weight: 30, reps: 8, completed: true),
            TrainingSet(exerciseId: "barbell_bench", setNumber: 3, weight: 20, reps: 12, completed: true),
            TrainingSet(exerciseId: "barbell_bench", setNumber: 4, weight: 90, reps: 30),
            TrainingSet(exerciseId: "custom-bench", setNumber: 1, weight: 50, reps: 10, completed: true)
        ])
        let timed = Workout(id: "timed", name: "时长", startedAt: sunday, endedAt: nextMonday, sets: [
            TrainingSet(exerciseId: "barbell_bench", setNumber: 1, weight: 100, reps: 60, completed: true, unit: .seconds)
        ])
        let empty = Workout(id: "empty", name: "空记录", startedAt: sunday, endedAt: sunday, sets: [])
        let tuesday = calendar.date(byAdding: .day, value: 1, to: monday)!
        let wednesday = calendar.date(byAdding: .day, value: 2, to: monday)!
        let emptyDay = Workout(id: "empty-day", name: "只有未完成组", startedAt: wednesday, endedAt: wednesday, sets: [
            TrainingSet(exerciseId: "barbell_bench", setNumber: 1, weight: 100, reps: 100)
        ])
        let draft = Workout(id: "draft", name: "未保存", startedAt: tuesday, sets: [
            TrainingSet(exerciseId: "barbell_bench", setNumber: 1, weight: 100, reps: 100, completed: true)
        ])
        let recentTimed = (0..<9).map { index in
            Workout(id: "timed-\(index)", name: "重复时长", startedAt: nextMonday.addingTimeInterval(Double(index)),
                    endedAt: nextMonday, sets: timed.sets)
        }
        let progress = TrainingProgress(workouts: [weighted, timed, empty, emptyDay, draft] + recentTimed, calendar: calendar)
        let week = progress.week(containing: sunday)
        let days = week.days
        precondition(days.count == 7 && days.first?.date == monday && days.last?.date == sunday, "Monday to Sunday calendar")
        precondition(days.first?.completedSets == 4 && days.last?.completedSets == 1, "only completed sets count as activity")
        precondition(Set(days.last!.workouts.map(\.id)) == ["timed", "empty"], "saved empty sessions remain visible")
        precondition(week.activeDays(through: sunday) == 2, "in-progress and incomplete-only days do not count")
        precondition(week.activeDays(through: monday) == 1, "dates later than today do not count")
        precondition(progress.recentWeeks(through: nextMonday).map { $0.activeDays(through: nextMonday) } == [0, 0, 2, 1],
                     "four weeks, with multiple finished workouts on one day counted once")

        let bench = progress.exercise("barbell_bench")
        precondition(bench.records.heaviestSet?.weight == 30 && bench.records.heaviestSet?.reps == 8, "heaviest set ties favor more reps")
        precondition(bench.records.value(.reps) == 12 && bench.records.value(.seconds) == 60, "separate reps and seconds; timed weight ignored")
        precondition(progress.exercise("custom-bench").records.value(.weight) == 50, "custom exercise IDs stay separate")
        precondition(bench.recent.count == 5 && bench.recentByMetric[.seconds]?.count == 8, "recent history limits")
        precondition(bench.recentByMetric[.weight]?.map(\.id) == ["weighted"], "recent metric points survive newer sessions with another unit")
    }

    @MainActor
    static func checkSaveAsPlan(in directory: URL) throws {
        let file = directory.appendingPathComponent("repeat-plans.json")
        let timedSets = (2...22).map { number in
            TrainingSet(exerciseId: "plank", setNumber: number, weight: 2400, reps: 1300,
                        completed: true, unit: .seconds, restSeconds: 700)
        }
        let workout = Workout(id: "finished", name: "混合训练", endedAt: .now, note: "只留在历史", sets: [
            TrainingSet(exerciseId: "plank", setNumber: 1, weight: 5, reps: 10),
            TrainingSet(exerciseId: "barbell_bench", setNumber: 1, weight: 0, reps: 20, completed: true, unit: .seconds),
            TrainingSet(exerciseId: "barbell_bench", setNumber: 2, weight: 18, reps: 8, completed: true, unit: .reps),
            TrainingSet(exerciseId: "barbell_bench", setNumber: 3, weight: 22, reps: 5, completed: true),
            TrainingSet(exerciseId: "pull_up", setNumber: 1, weight: 0, reps: 0, completed: true),
            TrainingSet(exerciseId: "plank", setNumber: 1, weight: 0, reps: 10, completed: true, unit: .reps)
        ] + timedSets + [
            TrainingSet(exerciseId: "plank", setNumber: 23, weight: 0, reps: 0, completed: true, unit: .seconds),
            TrainingSet(exerciseId: "push_up", setNumber: 1, weight: 0, reps: 9, completed: true, restSeconds: 0)
        ])
        var fixture = AppState.starter()
        fixture.workouts = [
            workout,
            Workout(id: "draft", name: "进行中", sets: workout.sets),
            Workout(id: "empty", name: "未完成", endedAt: .now, sets: [workout.sets[0]])
        ]
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        do {
            try store.saveWorkoutAsPlan("draft")
            preconditionFailure("unfinished workouts cannot be saved as plans")
        } catch WorkoutPlanError.unavailable {}
        do {
            try store.saveWorkoutAsPlan("empty")
            preconditionFailure("workouts without usable sets cannot be saved as plans")
        } catch WorkoutPlanError.empty {}

        let plan = try store.saveWorkoutAsPlan(workout.id)
        precondition(plan.name == "混合训练 · 复练计划" && plan.note.isEmpty, "new plan with no history note")
        precondition(plan.items.map(\.exerciseId) == ["barbell_bench", "plank", "push_up"], "first usable appearance and incomplete groups")
        let bench = plan.items[0]
        precondition(bench.sets == 2 && bench.weight == 22 && bench.reps == 5 && bench.unit == .reps && bench.restSeconds == 90, "mixed units, legacy reps and rest defaults")
        let plank = plan.items[1]
        precondition(plank.sets == 20 && plank.weight == 2000 && plank.reps == 1000 && plank.unit == .seconds && plank.restSeconds == 600, "same-unit count and plan limits")
        precondition(plan.items[2].restSeconds == 0, "zero rest retained")
        let duplicate = try store.saveWorkoutAsPlan(workout.id)
        precondition(duplicate.id != plan.id && duplicate.name == "\(plan.name)（2）", "repeat saves create uniquely named plans")
        let reopened = TrainingStore(fileURL: file)
        precondition(reopened.state.plans.count == fixture.plans.count + 2 && reopened.state.plans.contains(plan), "plans persist without replacing older plans")
        precondition(reopened.state.workouts == fixture.workouts, "original sessions are unchanged")
        reopened.discardWorkout()
        reopened.startWorkout(planId: plan.id)
        precondition(reopened.activeWorkout?.sets.count == 23 && reopened.activeWorkout?.sets[2].unit == .seconds, "derived plan starts a training session")

        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        let plansBeforeFailure = store.state.plans
        do {
            try store.saveWorkoutAsPlan(workout.id)
            preconditionFailure("an unsuccessful write cannot report a new plan")
        } catch is CocoaError {}
        precondition(store.state.plans == plansBeforeFailure, "a failed write leaves the store consistent")
    }

    @MainActor
    static func checkWeeklyGoal(in directory: URL) throws {
        let file = directory.appendingPathComponent("weekly-goal.json")
        let store = TrainingStore(fileURL: file)
        let planIds = store.state.plans.map(\.id)
        precondition(store.state.weeklyGoalDays == nil, "new installations start with goals off")
        try store.setWeeklyGoal(1)
        precondition(TrainingStore(fileURL: file).state.weeklyGoalDays == 1, "minimum goal persists")
        try store.setWeeklyGoal(7)
        do {
            try store.setWeeklyGoal(8)
            preconditionFailure("invalid weekly goal must be rejected")
        } catch WeeklyGoalError.invalidDays {}
        precondition(TrainingStore(fileURL: file).state.weeklyGoalDays == 7, "maximum goal persists")
        try store.setWeeklyGoal(nil)
        let reopened = TrainingStore(fileURL: file)
        precondition(reopened.state.weeklyGoalDays == nil, "turning off the goal persists")
        precondition(reopened.state.plans.map(\.id) == planIds, "goal changes preserve training plans")
    }

    @MainActor
    static func checkSchedule(in directory: URL) throws {
        let file = directory.appendingPathComponent("schedule.json")
        let zone = TimeZone(identifier: "America/Los_Angeles")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let today = calendar.date(from: DateComponents(year: 2026, month: 11, day: 4, hour: 23, minute: 30))!
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!
        let yesterday = calendar.date(byAdding: .day, value: -1, to: today)!
        precondition(ScheduledTraining.localDay(today, timeZone: zone) == "2026-11-04", "date keys use the device's local civil day")
        precondition(ScheduledTraining.localDay(today, timeZone: .gmt) == "2026-11-05", "local day differs from UTC at midnight")

        var fixture = AppState.starter()
        let first = fixture.plans[0]
        let second = fixture.plans[1]
        let third = fixture.plans[2]
        let done = TrainingSet(exerciseId: "barbell_bench", setNumber: 1, weight: 20, reps: 8, completed: true)
        fixture.workouts = [
            Workout(planId: first.id, name: first.name, startedAt: today, endedAt: today.addingTimeInterval(3600), sets: [done]),
            Workout(planId: second.id, name: second.name, startedAt: today, sets: [done]),
            Workout(planId: second.id, name: second.name, startedAt: today, endedAt: today, sets: []),
            Workout(planId: nil, name: second.name, startedAt: today, endedAt: today, sets: [done])
        ]
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        try store.scheduleTraining(planId: first.id, on: yesterday, now: yesterday, timeZone: zone)
        try store.scheduleTraining(planId: first.id, on: today, now: today, timeZone: zone)
        try store.scheduleTraining(planId: second.id, on: today, now: today, timeZone: zone)
        try store.scheduleTraining(planId: first.id, on: tomorrow, now: today, timeZone: zone)
        let duplicate = try store.scheduleTraining(planId: first.id, on: calendar.startOfDay(for: today), now: today, timeZone: zone)
        precondition(!duplicate, "same date and plan are deduplicated regardless of time")
        do {
            try store.scheduleTraining(planId: second.id, on: yesterday, now: today, timeZone: zone)
            preconditionFailure("adding a past schedule must be rejected")
        } catch ScheduleError.pastDate {}
        do {
            try store.scheduleTraining(planId: "missing", on: today, now: today, timeZone: zone)
            preconditionFailure("the plan must exist")
        } catch ScheduleError.missingPlan {}

        let reopened = TrainingStore(fileURL: file)
        let items = reopened.trainingSchedule(now: today, timeZone: zone)
        precondition(items.count == 4, "distinct plans and dates persist after relaunch")
        let statuses = Dictionary(uniqueKeysWithValues: items.map { ($0.entry, $0.status) })
        let todayFirst = ScheduledTraining(planId: first.id, day: "2026-11-04")
        let todaySecond = ScheduledTraining(planId: second.id, day: "2026-11-04")
        precondition(statuses[todayFirst] == .completed, "completion uses matching plan ID and local start, even when ending the following day")
        precondition(statuses[todaySecond] == .pending, "drafts, zero-set sessions, and unrelated workouts do not complete an entry")
        precondition(statuses[ScheduledTraining(planId: first.id, day: "2026-11-03")] == .missed, "past pending entries show missed")
        precondition(statuses[ScheduledTraining(planId: first.id, day: "2026-11-05")] == .upcoming, "future entries stay scheduled")

        try reopened.cancelScheduledTraining(todayFirst)
        precondition(TrainingStore(fileURL: file).state.trainingSchedule?.contains(todayFirst) == false, "cancellation persists")
        try reopened.deletePlan(first.id)
        let afterDelete = TrainingStore(fileURL: file)
        precondition(afterDelete.state.trainingSchedule == [todaySecond], "deleting a plan removes only its schedule entries")
        precondition(afterDelete.state.workouts == fixture.workouts, "cancellation and deletion leave training history unchanged")

        let now = Date.now
        try afterDelete.scheduleTraining(planId: third.id, on: now)
        let todayThird = ScheduledTraining(planId: third.id, day: ScheduledTraining.localDay(now))
        precondition(!afterDelete.startScheduledTraining(todayThird), "quick start preserves the current workout")
        afterDelete.discardWorkout()
        precondition(afterDelete.startScheduledTraining(todayThird) && afterDelete.activeWorkout?.planId == third.id, "quick start uses the scheduled plan")
    }

    static func checkComparisons() {
        func date(_ seconds: TimeInterval) -> Date { Date(timeIntervalSince1970: seconds) }
        let exercise = "barbell_bench"
        let reps = TrainingSet(exerciseId: exercise, setNumber: 2, weight: 40, reps: 5, completed: true)
        let timed = TrainingSet(exerciseId: exercise, setNumber: 1, weight: 90, reps: 40, completed: true, unit: .seconds)
        let noTarget = TrainingSet(exerciseId: exercise, setNumber: 4, weight: 100, reps: 0, completed: true)
        let incomplete = TrainingSet(exerciseId: exercise, setNumber: 5, weight: 120, reps: 12)
        let oldPlan = Workout(id: "plan-prior", planId: "plan", name: "旧计划名称", startedAt: date(30), endedAt: date(45), sets: [
            reps,
            TrainingSet(exerciseId: exercise, setNumber: 1, weight: 30, reps: 10, completed: true, unit: .reps),
            timed, incomplete, noTarget
        ])
        let recentTimed = Workout(id: "recent-timed", planId: "another", name: "不同计划", startedAt: date(65), endedAt: date(100), sets: [timed])
        let otherExercise = Workout(id: "other-exercise", planId: "another", name: "旧计划名称", startedAt: date(72), endedAt: date(76), sets: [
            TrainingSet(exerciseId: "custom-bench", setNumber: 1, weight: 130, reps: 10, completed: true)
        ])
        let emptyPlan = Workout(id: "empty", planId: "plan", name: "没有有效组", startedAt: date(79), endedAt: date(85), sets: [noTarget, incomplete])
        let draft = Workout(id: "draft", planId: "plan", name: "未保存", startedAt: date(88), sets: [reps, timed])
        let overlap = Workout(id: "overlap", planId: "plan", name: "之后才完成", startedAt: date(90), endedAt: date(105), sets: [reps, timed])
        let invalid = Workout(id: "invalid", planId: "plan", name: "时间异常", startedAt: date(98), endedAt: date(95), sets: [reps, timed])
        let active = Workout(id: "current", planId: "plan", name: "新计划名称", startedAt: date(100), sets: [
            TrainingSet(exerciseId: exercise, setNumber: 1, weight: 60, reps: 4, completed: true),
            TrainingSet(exerciseId: exercise, setNumber: 2, weight: 90, reps: 45, completed: true, unit: .seconds),
            TrainingSet(exerciseId: exercise, setNumber: 3, weight: 90, reps: 15, completed: true, unit: .seconds),
            noTarget,
            TrainingSet(exerciseId: "untested-exercise", setNumber: 1, weight: 0, reps: 10)
        ])
        var saved = active
        saved.endedAt = active.startedAt
        let candidates = [oldPlan, recentTimed, otherExercise, emptyPlan, draft, overlap, invalid, saved]
        let model = TrainingComparison(workouts: candidates)
        let references = model.previousExerciseSets(for: active)
        precondition(references.keys.sorted() == [exercise], "only matching stable exercise IDs have references")
        precondition(references[exercise]?.map(\.unit) == [.reps, .seconds], "each unit has its own reference")
        precondition(references[exercise]?.map { $0.workout.id } == ["plan-prior", "recent-timed"],
                     "references skip current, unfinished, overlapping, wrong-unit, zero-target and unrelated sets")
        precondition(references[exercise]?.first?.sets.map(\.setNumber) == [1, 2], "completed groups use set order and legacy reps")

        let comparison = model.previousPlanWorkout(for: saved)!
        precondition(comparison.workout.id == oldPlan.id, "recap uses stable plan ID and valid completed sets")
        precondition(comparison.previous.completedSets == 3 && comparison.previous.volume == 500 && comparison.previous.timedSeconds == 40,
                     "prior totals separate weighted repetitions from timed seconds")
        precondition(comparison.current.completedSets == 3 && comparison.current.volume == 240 && comparison.current.timedSeconds == 60,
                     "current totals exclude incomplete and zero-target groups")
        var free = saved
        free.planId = nil
        precondition(model.previousPlanWorkout(for: free) == nil && model.previousPlanWorkout(for: active) == nil, "only saved plan workouts have recaps")
        precondition(model.previousExerciseSets(for: free)[exercise]?.count == 2, "exercise references also work in free training")

        var tiedStart = oldPlan
        tiedStart.id = "a"
        tiedStart.endedAt = date(50)
        var tiedEnd = tiedStart
        tiedEnd.id = "b"
        let ties = TrainingComparison(workouts: [tiedEnd, oldPlan, tiedStart]).previousExerciseSets(for: active)
        precondition(ties[exercise]?.first?.workout.id == "a", "same start uses latest end, then stable ID")
    }
}
