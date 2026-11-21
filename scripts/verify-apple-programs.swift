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
        try checkBackup(in: directory)
        checkWellnessTrends()
        try checkPlanReuse(in: directory)
        try checkReusePreviousSet(in: directory)
        try checkExerciseReplacement(in: directory)
        try checkExerciseOrder(in: directory)
        try checkExerciseIdNormalization(in: directory)
        try checkBackupV3(in: directory)
        try checkMergeImport(in: directory)
        try checkSnapshots(in: directory)
        try checkWarmupsAndEstimatedMax(in: directory)
        try checkProgression(in: directory)
        checkWeightUnits()
        try checkV3StoreAPIs(in: directory)
        print("Passed: 34 programs / 69 days; legacy data, persistence, progress, plans, goals, schedules, comparisons, wellness, backup, plan reuse, previous groups, replacement and exercise ordering; v3 exercise IDs, backup fields and validation, merge import, snapshots and undo, warm-ups, e1RM, progression, weight units, preferences and food quick-add.")
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
        let retainedHistory = fixture.workouts.map { workout in
            var retained = workout
            if retained.planId == first.id { retained.planId = nil }
            return retained
        }
        precondition(afterDelete.state.workouts == retainedHistory, "deletion clears the plan reference and preserves the saved history")

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

    @MainActor
    static func checkBackup(in directory: URL) throws {
        func reject(_ data: Data, _ fragment: String) {
            do {
                _ = try TrainingBackup.parse(data)
                preconditionFailure("backup must be rejected: \(fragment)")
            } catch {
                precondition(error.localizedDescription.contains(fragment), "expected \(fragment), got \(error.localizedDescription)")
            }
        }
        let started = Date(timeIntervalSince1970: 1_762_387_200.125)
        let ended = started.addingTimeInterval(3600)
        var state = AppState.starter()
        state.exercises.append(Exercise(id: "custom-bench", name: "杠铃卧推", muscle: "胸", equipment: "杠铃", isCustom: true))
        state.plans = [Plan(id: "plan-a", name: "推日", note: "保留", createdAt: started, items: [
            PlanItem(id: "later", exerciseId: "barbell_bench", sets: 1, reps: 5, weight: 20, unit: .reps, restSeconds: 30),
            PlanItem(id: "first", exerciseId: "custom-bench", sets: 4, reps: 8, weight: 40, unit: .seconds, restSeconds: 0),
        ])]
        state.workouts = [Workout(id: "workout-a", planId: "plan-a", name: "推日", startedAt: started, endedAt: ended, note: "笔记", sets: [
            TrainingSet(id: "set-b", exerciseId: "barbell_bench", setNumber: 2, weight: 50, reps: 6, completed: true),
            TrainingSet(id: "set-a", exerciseId: "custom-bench", setNumber: 1, weight: 0, reps: 40, completed: false, unit: .seconds, restSeconds: 15),
        ])]
        state.bodyEntries = [BodyEntry(id: "body-a", recordedAt: started, weight: 70.5, bodyFat: nil)]
        state.foodEntries = [FoodEntry(id: "food-a", loggedAt: ended, meal: "早餐", name: "鸡蛋", portion: "2个", calories: 140, protein: 12, carbs: 1, fat: 10)]
        state.weeklyGoalDays = 4
        state.trainingSchedule = [ScheduledTraining(planId: "plan-a", day: "2026-11-06")]
        state.favoritePlanIds = ["plan-a"]
        let exportedAt = Date(timeIntervalSince1970: 1_762_390_800.5)
        let data = try TrainingBackup.encode(state, exportedAt: exportedAt)
        let parsed = try TrainingBackup.parse(data)
        precondition(parsed.preview.plans == 1 && parsed.preview.finishedWorkouts == 1 && parsed.preview.bodyEntries == 1 && parsed.preview.foodEntries == 1, "preview counts the exported records")
        precondition(parsed.state.plans[0].items.map(\.id) == ["later", "first"], "plan items keep their saved order")
        precondition(parsed.state.workouts[0].sets.map(\.id) == ["set-b", "set-a"], "sets keep their saved order")
        precondition(parsed.state.exercises.contains { $0.id == "custom-bench" && $0.isCustom }, "same-name custom exercises stay custom")
        precondition(parsed.state.workouts[0].sets[1].unit == .seconds && parsed.state.workouts[0].sets[1].restSeconds == 15, "timed sets keep unit and rest")
        precondition(parsed.state.bodyEntries[0].bodyFat == nil && parsed.state.weeklyGoalDays == 4, "optional body fat and weekly goal round-trip")
        precondition(parsed.state.favoritePlanIds == ["plan-a"], "favorites round-trip in the shared backup format")

        let file = directory.appendingPathComponent("backup-store.json")
        let store = TrainingStore(fileURL: file)
        try store.setWeeklyGoal(2)
        try store.scheduleTraining(planId: store.state.plans[0].id, on: Date.now)
        try store.togglePlanFavorite(store.state.plans[0].id)
        let preservedGoal = try store.exportBackup()
        let stripped = try JSONSerialization.jsonObject(with: preservedGoal, options: .mutableContainers) as! NSMutableDictionary
        stripped.removeObject(forKey: "weeklyGoal")
        stripped.removeObject(forKey: "schedule")
        stripped.removeObject(forKey: "favoritePlanIds")
        try store.restoreBackup(try JSONSerialization.data(withJSONObject: stripped))
        precondition(store.state.weeklyGoalDays == 2, "old backups keep the current weekly goal")
        precondition(store.state.trainingSchedule == nil, "old backups clear schedules tied to the replaced plans")
        precondition(store.state.favoritePlanIds == nil, "old backups clear favorites tied to the replaced plans")

        let phone = """
        {"app":"lianji","version":1,"exportedAt":"2026-11-06T02:13:00Z","weeklyGoal":0,"favoritePlanIds":["plan-a"],"schedule":[{"day":"2026-11-06","planId":"plan-a"}],"tables":{"exercises":[{"id":"ex-a","name":"杠铃卧推","muscle":"胸","equipment":"杠铃","isCustom":0},{"id":"ex-b","name":"自定义","muscle":"胸","equipment":"哑铃","isCustom":true}],"plans":[{"id":"plan-a","name":"推日","note":"","createdAt":"2026-11-01T00:00:00.000Z"}],"plan_items":[{"id":"item-a","planId":"plan-a","exerciseId":"ex-a","sortOrder":1,"sets":3,"reps":8,"weight":40},{"id":"item-b","planId":"plan-a","exerciseId":"ex-b","sortOrder":0,"sets":2,"reps":12,"weight":10,"unit":"seconds","restSeconds":45}],"workouts":[{"id":"wo-a","planId":null,"name":"自由训练","startedAt":"2026-11-06T01:00:00.000Z","endedAt":null,"note":""}],"workout_sets":[{"id":"set-a","workoutId":"wo-a","exerciseId":"ex-a","sortOrder":0,"setNumber":1,"weight":40,"reps":8,"completed":1}],"body_entries":[{"id":"body-a","recordedAt":"2026-11-06T00:00:00.000Z","weight":70,"bodyFat":null}],"food_entries":[{"id":"food-a","loggedAt":"2026-11-06T00:30:00.000Z","meal":"早餐","name":"鸡蛋","portion":"2个","calories":140,"protein":12,"carbs":1,"fat":10}]}}
        """.data(using: .utf8)!
        let restored = try store.restoreBackup(phone)
        precondition(restored.finishedWorkouts == 0 && store.state.weeklyGoalDays == nil, "an explicit zero disables the goal and drafts are unfinished")
        precondition(store.state.plans[0].items.map(\.id) == ["item-b", "item-a"], "sort order, not file order, restores plan items")
        precondition(store.state.plans[0].items[1].unit == nil && store.state.plans[0].items[1].restSeconds == nil, "missing unit and rest stay optional")
        precondition(store.state.workouts[0].planId == nil && store.state.workouts[0].endedAt == nil, "phone nulls stay empty")
        precondition(store.state.exercises.contains { $0.id == "ex-b" && $0.isCustom }, "boolean custom flags are accepted")
        precondition(store.isPlanFavorite("plan-a"), "phone favorites restore on native platforms")
        let reopened = TrainingStore(fileURL: file)
        precondition(reopened.state.plans.map(\.id) == ["plan-a"] && reopened.state.foodEntries.count == 1 && reopened.state.trainingSchedule == [ScheduledTraining(planId: "plan-a", day: "2026-11-06")], "restored backup persists")
        precondition(reopened.isPlanFavorite("plan-a"), "restored phone favorites survive relaunch")

        try FileManager.default.setAttributes([.immutable: true], ofItemAtPath: file.path)
        defer { try? FileManager.default.setAttributes([.immutable: false], ofItemAtPath: file.path) }
        do {
            try store.restoreBackup(data)
            preconditionFailure("a locked store file must reject restore before replacing memory")
        } catch {}
        precondition(store.state.plans.map(\.id) == ["plan-a"] && store.state.weeklyGoalDays == nil, "failed restore keeps the current memory state")
        precondition(store.isPlanFavorite("plan-a"), "failed restore preserves favorites in memory")
        try FileManager.default.setAttributes([.immutable: false], ofItemAtPath: file.path)
        precondition(TrainingStore(fileURL: file).state.foodEntries.count == 1, "failed restore does not replace the saved file")
        precondition(TrainingStore(fileURL: file).isPlanFavorite("plan-a"), "failed restore preserves favorites on disk")

        reject(Data("not json".utf8), "JSON")
        reject(Data("{\"app\":\"other\",\"version\":1,\"tables\":{}}".utf8), "练迹")
        reject(Data("{\"app\":\"lianji\",\"version\":2,\"tables\":{}}".utf8), "不兼容")
        let missingTable = try JSONSerialization.jsonObject(with: phone, options: .mutableContainers) as! NSMutableDictionary
        let tables = missingTable["tables"] as! NSMutableDictionary
        tables["plans"] = NSNull()
        reject(try JSONSerialization.data(withJSONObject: missingTable), "缺少")
        reject(Data("{\"app\":\"lianji\",\"version\":1,\"exportedAt\":\"2026-11-06T00:00:00Z\",\"tables\":{\"exercises\":[],\"plans\":[{\"name\":\"无 id\"}],\"plan_items\":[],\"workouts\":[],\"workout_sets\":[],\"body_entries\":[],\"food_entries\":[]}}".utf8), "缺少 id")
        let badGoal = try JSONSerialization.jsonObject(with: phone, options: .mutableContainers) as! NSMutableDictionary
        for goal in [-1, 8, 2.5, "4"] as [Any] {
            badGoal["weeklyGoal"] = goal
            reject(try JSONSerialization.data(withJSONObject: badGoal), "每周训练目标")
        }
        badGoal["weeklyGoal"] = 0
        badGoal["schedule"] = [["day": "2026-02-29", "planId": "plan-a"]]
        reject(try JSONSerialization.data(withJSONObject: badGoal), "训练日程")
        badGoal["schedule"] = [["day": "2026-11-06", "planId": "plan-a"], ["day": "2026-11-06", "planId": "plan-a"]]
        reject(try JSONSerialization.data(withJSONObject: badGoal), "重复")
        let duplicate = try JSONSerialization.jsonObject(with: phone, options: .mutableContainers) as! NSMutableDictionary
        let duplicateTables = duplicate["tables"] as! NSMutableDictionary
        duplicateTables["plans"] = [
            ["id": "plan-a", "name": "甲", "note": "", "createdAt": "2026-11-01T00:00:00Z"],
            ["id": "plan-a", "name": "乙", "note": "", "createdAt": "2026-11-01T00:00:00Z"],
        ]
        reject(try JSONSerialization.data(withJSONObject: duplicate), "重复 id")
        let badFavorites = try JSONSerialization.jsonObject(with: phone, options: .mutableContainers) as! NSMutableDictionary
        for favorites in [NSNull(), [:], [NSNull()], [23], [""], ["missing"], ["plan-a", "plan-a"]] as [Any] {
            badFavorites["favoritePlanIds"] = favorites
            reject(try JSONSerialization.data(withJSONObject: badFavorites), "收藏计划")
        }
        badFavorites["favoritePlanIds"] = []
        let noFavorites = try TrainingBackup.parse(JSONSerialization.data(withJSONObject: badFavorites))
        precondition(noFavorites.state.favoritePlanIds == [], "an explicit empty favorite list remains empty")
    }

    static func checkWellnessTrends() {
        func date(_ seconds: TimeInterval) -> Date { Date(timeIntervalSince1970: seconds) }
        let tied = date(800)
        let earlierTie = date(300)
        let entries = [
            BodyEntry(id: "z", recordedAt: tied, weight: 72.5, bodyFat: nil),
            BodyEntry(id: "0", recordedAt: date(100), weight: 50, bodyFat: 10),
            BodyEntry(id: "c-tie", recordedAt: earlierTie, weight: 53, bodyFat: 12),
            BodyEntry(id: "1", recordedAt: date(200), weight: 51, bodyFat: nil),
            BodyEntry(id: "m", recordedAt: tied, weight: 70, bodyFat: 16),
            BodyEntry(id: "b-tie", recordedAt: earlierTie, weight: 52, bodyFat: nil),
            BodyEntry(id: "5", recordedAt: date(500), weight: 55, bodyFat: nil),
            BodyEntry(id: "4", recordedAt: date(400), weight: 54, bodyFat: 13),
            BodyEntry(id: "7", recordedAt: date(700), weight: 57, bodyFat: 15),
            BodyEntry(id: "6", recordedAt: date(600), weight: 56, bodyFat: 14),
        ]
        let trend = WellnessTrend.bodyTrend(entries)
        precondition(trend.points.map(\.id) == ["b-tie", "c-tie", "4", "5", "6", "7", "m", "z"], "body window of 8 is chronological after recordedAt then id")
        precondition(trend.points.map(\.bodyFat) == [nil, 12, 13, nil, 14, 15, 16, nil], "window keeps nil body fat")
        precondition(trend.latest?.id == "z" && trend.previous?.id == "m" && trend.weightDelta == 2.5, "delta uses the full list, tie-broken by id")
        precondition(trend.fatPoints.map(\.id) == ["0", "c-tie", "4", "6", "7", "m"], "fat points use their own window and omit nil body fat")
        precondition(!trend.points.contains { $0.id == "0" || $0.id == "1" }, "window of 8 drops older records")
        let latestOnly = WellnessTrend.bodyTrend(entries, limit: 1)
        precondition(latestOnly.points.map(\.id) == ["z"] && latestOnly.fatPoints.map(\.id) == ["m"], "weight and fat windows are independent")
        precondition(latestOnly.latest?.id == "z" && latestOnly.previous?.id == "m" && latestOnly.weightDelta == 2.5, "latest, previous and delta ignore the window")
        precondition(WellnessTrend.bodyTrend([]).latest == nil && WellnessTrend.bodyTrend([]).weightDelta == nil, "empty body trend has no delta")
        precondition(WellnessTrend.bodyTrend([BodyEntry(id: "only", recordedAt: date(1), weight: 60)]).previous == nil, "one record has no previous")

        let zone = TimeZone(identifier: "America/Los_Angeles")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        func local(_ day: Int, _ hour: Int, _ minute: Int) -> Date {
            calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute))!
        }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(secondsFromGMT: 0)!
        let morning = local(6, 0, 30)
        let evening = local(6, 23, 30)
        precondition(utc.component(.day, from: morning) != utc.component(.day, from: evening), "same local day must cross UTC midnight")
        let foods = [
            FoodEntry(id: "later", loggedAt: local(8, 0, 15), meal: "午餐", name: "米饭", portion: "1碗", calories: 200, protein: 4, carbs: 45, fat: 1),
            FoodEntry(id: "evening", loggedAt: evening, meal: "晚餐", name: "鱼", portion: "1份", calories: 20.22, protein: 1.11, carbs: 0.11, fat: 1.09),
            FoodEntry(id: "morning", loggedAt: morning, meal: "早餐", name: "燕麦", portion: "1碗", calories: 10.14, protein: 1.14, carbs: 0.14, fat: 1.06),
            FoodEntry(id: "older", loggedAt: local(5, 12, 0), meal: "加餐", name: "酸奶", portion: "1杯", calories: 1, protein: 1, carbs: 1, fat: 1),
        ]
        let days = WellnessTrend.nutritionTrend(foods, timeZone: zone)
        precondition(days.map(\.day) == ["2026-11-05", "2026-11-06", "2026-11-08"], "nutrition days sort ascending and do not fill empty days")
        let summed = days[1]
        precondition(summed.calories == 30.4 && summed.protein == 2.3 && summed.carbs == 0.3 && summed.fat == 2.2, "two Los Angeles entries on the same local day sum to one decimal")
        precondition(WellnessTrend.nutritionTrend(foods, limit: 2, timeZone: zone).map(\.day) == ["2026-11-06", "2026-11-08"], "nutrition window keeps the latest days with entries")
    }
    @MainActor
    static func checkPlanReuse(in directory: URL) throws {
        let file = directory.appendingPathComponent("plan-reuse.json")
        var fixture = AppState.starter()
        fixture.plans[1].note = "保留备注\n按实际调整"
        fixture.plans[1].items = [
            PlanItem(exerciseId: "barbell_bench", sets: 4, reps: 8, weight: 45),
            PlanItem(exerciseId: "plank", sets: 2, reps: 50, weight: 0, unit: .seconds, restSeconds: 0)
        ]
        let original = fixture.plans[1]
        let today = Date.now
        fixture.trainingSchedule = [ScheduledTraining(planId: original.id, day: ScheduledTraining.localDay(today))]
        let trainingStart = Date(timeIntervalSince1970: 1_762_387_200)
        fixture.workouts = [Workout(planId: original.id, name: original.name, startedAt: trainingStart, endedAt: trainingStart.addingTimeInterval(60), sets: [
            TrainingSet(exerciseId: "barbell_bench", setNumber: 1, weight: 45, reps: 8, completed: true, unit: .reps, restSeconds: 90)
        ])]
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        let first = fixture.plans[0].id
        let third = fixture.plans[2].id
        try store.togglePlanFavorite(third)
        try store.togglePlanFavorite(first)
        precondition(store.orderedPlans.map(\.id) == [first, third, original.id], "favorites preserve source ordering within each group")
        precondition(store.state.plans == fixture.plans, "favoriting changes presentation order only")
        try store.togglePlanFavorite(first)
        precondition(store.orderedPlans.map(\.id) == [third, first, original.id], "unfavoriting restores source position")
        try store.togglePlanFavorite(original.id)

        let copy = try store.duplicatePlan(original.id)
        precondition(copy.id != original.id && copy.name == "\(original.name) · 副本" && copy.note == original.note, "copy creates a fresh named plan and preserves notes")
        precondition(copy.createdAt >= original.createdAt, "copy has its own creation date")
        precondition(Set(copy.items.map(\.id)).isDisjoint(with: Set(original.items.map(\.id))), "copied items have fresh IDs")
        var copiedItems = copy.items
        for index in copiedItems.indices { copiedItems[index].id = original.items[index].id }
        precondition(copiedItems == original.items, "copy preserves exercise IDs, order, targets, legacy units, and zero rest")
        let secondCopy = try store.duplicatePlan(original.id)
        precondition(secondCopy.id != copy.id && secondCopy.name == "\(original.name) · 副本（2）", "repeated copies have unique IDs and names")
        precondition(!store.isPlanFavorite(copy.id) && !store.isPlanFavorite(secondCopy.id), "copies do not inherit favorites")
        precondition(store.state.trainingSchedule == fixture.trainingSchedule && store.state.workouts == fixture.workouts, "copies inherit no schedule or workout association")
        var editedCopy = copy
        editedCopy.items[0].weight = 60
        store.savePlan(editedCopy)
        precondition(store.state.plans.first { $0.id == original.id } == original, "editing a copied plan preserves its source")

        let reopened = TrainingStore(fileURL: file)
        precondition(reopened.isPlanFavorite(original.id) && reopened.isPlanFavorite(third) && !reopened.isPlanFavorite(first), "favorites survive relaunch")
        precondition(reopened.state.plans.contains(editedCopy), "copied targets survive relaunch")
        try reopened.deletePlan(original.id)
        precondition(!reopened.isPlanFavorite(original.id) && reopened.isPlanFavorite(third), "deletion removes only the matching favorite")
        var retainedHistory = fixture.workouts
        retainedHistory[0].planId = nil
        precondition(reopened.state.trainingSchedule?.isEmpty == true && reopened.state.workouts == retainedHistory, "deletion clears the source schedule and plan reference while preserving history")
        precondition(reopened.state.plans.contains(editedCopy), "deleting the source preserves its copies")
        let afterDeletion = try TrainingBackup.parse(reopened.exportBackup())
        precondition(afterDeletion.state.workouts == retainedHistory && afterDeletion.preview.finishedWorkouts == 1,
                     "a favorited plan can be deleted without making saved history impossible to restore")
        let normalizedCopyItems = editedCopy.items.map { item in
            var normalized = item
            normalized.unit = item.unit ?? .reps
            normalized.restSeconds = item.restSeconds ?? 90
            return normalized
        }
        precondition(afterDeletion.state.favoritePlanIds == [third] && afterDeletion.state.plans.first(where: { $0.id == editedCopy.id })?.items == normalizedCopyItems,
                     "backup after deletion preserves surviving favorites and independent copies")
        do {
            try reopened.duplicatePlan("missing")
            preconditionFailure("copying a missing plan must fail")
        } catch PlanReuseError.missingPlan {}

        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        let plansBeforeFailure = reopened.state.plans
        let favoritesBeforeFailure = reopened.state.favoritePlanIds
        do {
            try reopened.duplicatePlan(copy.id)
            preconditionFailure("a failed copy cannot report success")
        } catch is CocoaError {}
        do {
            try reopened.togglePlanFavorite(copy.id)
            preconditionFailure("a failed favorite write cannot report success")
        } catch is CocoaError {}
        precondition(reopened.state.plans == plansBeforeFailure && reopened.state.favoritePlanIds == favoritesBeforeFailure,
                     "failed copy and favorite writes preserve in-memory state")
    }

    @MainActor
    static func checkReusePreviousSet(in directory: URL) throws {
        func expectStale(_ action: () throws -> Void) throws {
            do {
                try action()
                preconditionFailure("a stale or completed row must not be overwritten")
            } catch ReusePreviousSetError.staleReference {}
        }
        let now = Date.now
        let exercise = "barbell_bench"
        let sourceReps = Workout(id: "source-reps", name: "上次力量", startedAt: now.addingTimeInterval(-3600), endedAt: now.addingTimeInterval(-3000), sets: [
            TrainingSet(id: "source-2", exerciseId: exercise, setNumber: 2, weight: 80, reps: 6, completed: true, restSeconds: 0),
            TrainingSet(id: "source-1", exerciseId: exercise, setNumber: 1, weight: 70, reps: 8, completed: true, unit: .reps),
            TrainingSet(id: "source-3", exerciseId: exercise, setNumber: 3, weight: 2500, reps: 5, completed: true)
        ])
        let sourceTimed = Workout(id: "source-timed", name: "上次计时", startedAt: now.addingTimeInterval(-1800), endedAt: now.addingTimeInterval(-1000), sets: [
            TrainingSet(id: "source-time-1", exerciseId: exercise, setNumber: 1, weight: 7, reps: 60, completed: true, unit: .seconds),
            TrainingSet(id: "source-time-2", exerciseId: exercise, setNumber: 2, weight: 0, reps: 1200, completed: true, unit: .seconds)
        ])
        let active = Workout(id: "active-reuse", name: "当前训练", startedAt: now, note: "保留", sets: [
            TrainingSet(id: "done", exerciseId: exercise, setNumber: 1, weight: 10, reps: 2, completed: true),
            TrainingSet(id: "time-1", exerciseId: exercise, setNumber: 2, weight: 5, reps: 30, unit: .seconds, restSeconds: 25),
            TrainingSet(id: "rep-2", exerciseId: exercise, setNumber: 3, weight: 20, reps: 10, restSeconds: 35),
            TrainingSet(id: "rep-3", exerciseId: exercise, setNumber: 4, weight: 20, reps: 10, restSeconds: 75),
            TrainingSet(id: "time-2", exerciseId: exercise, setNumber: 5, weight: 5, reps: 30, unit: .seconds, restSeconds: 55),
            TrainingSet(id: "rep-4", exerciseId: exercise, setNumber: 6, weight: 20, reps: 10)
        ])
        var fixture = AppState.starter()
        fixture.workouts = [sourceReps, sourceTimed, active]
        let references = TrainingComparison(workouts: fixture.workouts).previousExerciseSets(for: active)[exercise]!
        let repsReference = references.first { $0.unit == .reps }!
        let timedReference = references.first { $0.unit == .seconds }!
        let source = repsReference.reusableSet(for: active.sets[2], in: active)!
        precondition(source.set.id == "source-2", "completed current rows occupy their ordinal and mixed units count separately")
        precondition(timedReference.reusableSet(for: active.sets[1], in: active)?.set.id == "source-time-1", "timed rows reuse the newest timed source")
        precondition(repsReference.reusableSet(for: active.sets[0], in: active) == nil, "completed current rows have no reuse action")
        precondition(repsReference.reusableSet(for: active.sets[3], in: active) == nil, "out-of-range source weight cannot be applied")
        precondition(timedReference.reusableSet(for: active.sets[4], in: active) == nil, "out-of-range source target cannot be applied")
        precondition(repsReference.reusableSet(for: active.sets[5], in: active) == nil, "missing source ordinal has no fallback")

        let file = directory.appendingPathComponent("reuse-previous.json")
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        try store.reusePreviousSet(workoutId: active.id, setId: "rep-2", source: source)
        let applied = store.activeWorkout!.sets[2]
        precondition(applied.weight == 80 && applied.reps == 6 && !applied.completed && applied.unit == nil && applied.restSeconds == 35,
                     "reuse changes only weight and target while leaving plan rest, unit and completion intact")
        precondition(store.state.workouts[0] == sourceReps && store.state.workouts[1] == sourceTimed, "applying previous values preserves history")
        precondition(TrainingStore(fileURL: file).activeWorkout?.sets[2] == applied, "applied values persist after relaunch")
        let timedSource = timedReference.reusableSet(for: active.sets[1], in: active)!
        try store.reusePreviousSet(workoutId: active.id, setId: "time-1", source: timedSource)
        let appliedTime = store.activeWorkout!.sets[1]
        precondition(appliedTime.weight == 7 && appliedTime.reps == 60 && appliedTime.restSeconds == 25 && !appliedTime.completed,
                     "weighted timed sources apply both fields while preserving current rest")
        store.updateSet("rep-2", completed: true)
        try expectStale { try store.reusePreviousSet(workoutId: active.id, setId: "rep-2", source: source) }
        store.updateSet("rep-2", completed: false)
        try expectStale { try store.reusePreviousSet(workoutId: active.id, setId: "time-1", source: source) }
        store.deleteSet("done")
        try expectStale { try store.reusePreviousSet(workoutId: active.id, setId: "rep-2", source: source) }

        var changed = fixture
        changed.workouts[0].sets[0].weight = 85
        try JSONEncoder().encode(changed).write(to: file)
        let changedStore = TrainingStore(fileURL: file)
        try expectStale { try changedStore.reusePreviousSet(workoutId: active.id, setId: "rep-2", source: source) }
        changedStore.deleteWorkout(sourceReps.id)
        try expectStale { try changedStore.reusePreviousSet(workoutId: active.id, setId: "rep-2", source: source) }

        try JSONEncoder().encode(fixture).write(to: file)
        let failingStore = TrainingStore(fileURL: file)
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        do {
            try failingStore.reusePreviousSet(workoutId: active.id, setId: "rep-2", source: source)
            preconditionFailure("failed persistence must not apply previous values")
        } catch is CocoaError {}
        precondition(failingStore.state.workouts == fixture.workouts, "a failed write preserves the current group and history")
    }

    @MainActor
    static func checkExerciseReplacement(in directory: URL) throws {
        func expectUnavailable(_ action: () throws -> Void) throws {
            do {
                try action()
                preconditionFailure("a changed or completed group must reject replacement")
            } catch ExerciseReplacementError.unavailable {}
        }
        let source = "barbell_bench"
        let target = "plank"
        let customTarget = "custom-plank"
        var fixture = AppState.starter()
        fixture.exercises.append(Exercise(id: customTarget, name: "平板支撑", muscle: "自定义", equipment: "自重", isCustom: true))
        let history = Workout(id: "replace-history", planId: fixture.plans[0].id, name: "历史", endedAt: .now, sets: [
            TrainingSet(exerciseId: source, setNumber: 1, weight: 70, reps: 8, completed: true)
        ])
        let current = Workout(id: "replace-current", planId: fixture.plans[0].id, name: "当前", note: "保留笔记", sets: [
            TrainingSet(id: "replace-old-1", exerciseId: source, setNumber: 2, weight: 50, reps: 8, restSeconds: 0),
            TrainingSet(id: "replace-other", exerciseId: "pull_up", setNumber: 1, weight: 0, reps: 5, completed: true, restSeconds: 80),
            TrainingSet(id: "replace-old-2", exerciseId: source, setNumber: 7, weight: 20, reps: 60, unit: .seconds)
        ])
        fixture.workouts = [history, current]
        let file = directory.appendingPathComponent("exercise-replacement.json")
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        let request = store.exerciseReplacementRequest(workoutId: current.id, exerciseId: source)!
        precondition(request.setIds == ["replace-old-1", "replace-old-2"], "request snapshots all source row IDs in display order")
        precondition(store.exerciseReplacementRequest(workoutId: current.id, exerciseId: "pull_up") == nil, "a group with a completed row has no replacement action")
        for invalidTarget in [source, "pull_up", "missing"] {
            do {
                try store.replaceWorkoutExercise(request, with: invalidTarget)
                preconditionFailure("target must be a different available exercise")
            } catch ExerciseReplacementError.invalidTarget {}
        }
        store.updateSet("replace-old-2", completed: true)
        try expectUnavailable { try store.replaceWorkoutExercise(request, with: target) }
        store.updateSet("replace-old-2", completed: false)
        store.addSet(for: source)
        let additional = store.activeWorkout!.sets.last!.id
        try expectUnavailable { try store.replaceWorkoutExercise(request, with: target) }
        store.deleteSet(additional)

        try store.replaceWorkoutExercise(request, with: target)
        let replaced = store.activeWorkout!
        precondition(replaced.sets.map(\.exerciseId) == [target, "pull_up", target], "replacement preserves global group positions")
        precondition(replaced.sets.map(\.setNumber) == current.sets.map(\.setNumber), "replacement preserves original group numbers")
        precondition(replaced.sets.map(\.restSeconds) == current.sets.map(\.restSeconds), "replacement preserves zero and legacy optional rest")
        let newRows = replaced.sets.filter { $0.exerciseId == target }
        precondition(newRows.count == 2 && newRows.allSatisfy { !$0.completed && $0.weight == 0 && $0.reps == 30 && $0.unit == .seconds },
                     "timed replacement defaults every pending group to zero weight and thirty seconds")
        precondition(Set(newRows.map(\.id)).isDisjoint(with: Set(request.setIds)), "replacement creates fresh row IDs")
        precondition(replaced.sets[1] == current.sets[1] && replaced.note == current.note && replaced.planId == current.planId, "unrelated rows and workout context are preserved")
        precondition(store.state.workouts[0] == history && store.state.plans == fixture.plans, "replacement leaves source history and saved plans intact")
        store.updateSet("replace-old-1", weight: 999, reps: 999, completed: true)
        store.deleteSet("replace-old-2")
        precondition(store.activeWorkout == replaced, "queued old-ID events cannot modify replacement rows")
        try expectUnavailable { try store.replaceWorkoutExercise(request, with: customTarget) }
        precondition(TrainingStore(fileURL: file).activeWorkout == replaced, "replacement persists across relaunch")

        let secondRequest = store.exerciseReplacementRequest(workoutId: current.id, exerciseId: target)!
        try store.replaceWorkoutExercise(secondRequest, with: customTarget)
        precondition(store.activeWorkout!.sets.filter { $0.exerciseId == customTarget }.allSatisfy { $0.unit == .reps && $0.reps == 10 && $0.weight == 0 },
                     "same-name custom exercises use their own repetition defaults")
        store.finishWorkout()
        try expectUnavailable { try store.replaceWorkoutExercise(secondRequest, with: source) }

        try JSONEncoder().encode(fixture).write(to: file)
        let failingStore = TrainingStore(fileURL: file)
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        do {
            try failingStore.replaceWorkoutExercise(request, with: target)
            preconditionFailure("failed persistence must reject replacement")
        } catch is CocoaError {}
        precondition(failingStore.state.workouts == fixture.workouts && failingStore.state.plans == fixture.plans,
                     "a failed atomic write preserves pending groups and all source data")
    }

    @MainActor
    static func checkExerciseOrder(in directory: URL) throws {
        func expectUnavailable(_ action: () throws -> Void) throws {
            do {
                try action()
                preconditionFailure("stale or missing exercise groups must reject moves")
            } catch ExerciseOrderError.unavailable {}
        }
        let first = "barbell_bench"
        let second = "plank"
        let third = "pull_up"
        var fixture = AppState.starter()
        let history = Workout(id: "order-history", planId: fixture.plans[0].id, name: "历史", endedAt: .now, sets: [
            TrainingSet(id: "order-history-set", exerciseId: first, setNumber: 1, weight: 30, reps: 10, completed: true)
        ])
        let current = Workout(id: "order-current", planId: fixture.plans[0].id, name: "当前", note: "保留训练笔记", sets: [
            TrainingSet(id: "a1", exerciseId: first, setNumber: 1, weight: 40, reps: 8, completed: true, restSeconds: 15),
            TrainingSet(id: "b1", exerciseId: second, setNumber: 1, weight: 0, reps: 45, unit: .seconds, restSeconds: 0),
            TrainingSet(id: "a2", exerciseId: first, setNumber: 4, weight: 45, reps: 6, unit: .reps),
            TrainingSet(id: "c1", exerciseId: third, setNumber: 1, weight: 0, reps: 3, completed: true, unit: .reps, restSeconds: 30),
            TrainingSet(id: "b2", exerciseId: second, setNumber: 2, weight: 3, reps: 60, completed: true, unit: .seconds, restSeconds: 10),
            TrainingSet(id: "a3", exerciseId: first, setNumber: 7, weight: 0, reps: 30, unit: .seconds, restSeconds: 90)
        ])
        fixture.workouts = [history, current]
        let file = directory.appendingPathComponent("exercise-order.json")
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        let snapshot = current.exerciseIds
        try store.moveWorkoutExercise(workoutId: current.id, exerciseId: second, direction: -1, orderedExerciseIds: snapshot)
        let moved = store.activeWorkout!
        precondition(moved.exerciseIds == [second, first, third], "up moves exactly one exercise group")
        precondition(moved.sets.map(\.id) == ["b1", "b2", "a1", "a2", "a3", "c1"], "interleaved rows are grouped while preserving internal row order")
        precondition(Dictionary(uniqueKeysWithValues: moved.sets.map { ($0.id, $0) }) == Dictionary(uniqueKeysWithValues: current.sets.map { ($0.id, $0) }),
                     "all row IDs, units, targets, rests and completed flags remain identical")
        var context = moved
        context.sets = current.sets
        precondition(context == current && store.state.workouts[0] == history && store.state.plans == fixture.plans,
                     "workout context, history and saved plans remain intact")
        precondition(TrainingStore(fileURL: file).activeWorkout == moved, "group ordering persists after relaunch")
        try expectUnavailable {
            try store.moveWorkoutExercise(workoutId: current.id, exerciseId: second, direction: 1, orderedExerciseIds: snapshot)
        }
        try store.moveWorkoutExercise(workoutId: current.id, exerciseId: second, direction: 1, orderedExerciseIds: moved.exerciseIds)
        precondition(store.activeWorkout!.exerciseIds == snapshot, "down moves exactly one exercise group")
        for request in [(first, -1), (third, 1)] {
            do {
                try store.moveWorkoutExercise(workoutId: current.id, exerciseId: request.0, direction: request.1, orderedExerciseIds: snapshot)
                preconditionFailure("a boundary move must be rejected")
            } catch ExerciseOrderError.boundary {}
        }
        for direction in [0, 2, Int.min, Int.max] {
            do {
                try store.moveWorkoutExercise(workoutId: current.id, exerciseId: second, direction: direction, orderedExerciseIds: snapshot)
                preconditionFailure("only adjacent directions are accepted")
            } catch ExerciseOrderError.invalidDirection {}
        }
        try expectUnavailable {
            try store.moveWorkoutExercise(workoutId: "missing", exerciseId: first, direction: 1, orderedExerciseIds: snapshot)
        }
        try expectUnavailable {
            try store.moveWorkoutExercise(workoutId: current.id, exerciseId: "missing", direction: 1, orderedExerciseIds: snapshot)
        }
        try expectUnavailable {
            try store.moveWorkoutExercise(workoutId: current.id, exerciseId: first, direction: 1, orderedExerciseIds: [first, second])
        }
        store.addSet(for: first)
        let appended = store.activeWorkout!.sets.last!
        try store.moveWorkoutExercise(workoutId: current.id, exerciseId: first, direction: 1, orderedExerciseIds: snapshot)
        precondition(store.activeWorkout!.sets.filter { $0.exerciseId == first }.map(\.id) == ["a1", "a2", "a3", appended.id],
                     "an appended group row is retained without invalidating an unchanged exercise-order snapshot")
        let beforeNewGroup = store.activeWorkout!.exerciseIds
        store.addWorkoutExercise("overhead_press")
        try expectUnavailable {
            try store.moveWorkoutExercise(workoutId: current.id, exerciseId: first, direction: 1, orderedExerciseIds: beforeNewGroup)
        }
        let beforeFinish = store.activeWorkout!.exerciseIds
        store.finishWorkout()
        try expectUnavailable {
            try store.moveWorkoutExercise(workoutId: current.id, exerciseId: first, direction: 1, orderedExerciseIds: beforeFinish)
        }

        try JSONEncoder().encode(fixture).write(to: file)
        let failingStore = TrainingStore(fileURL: file)
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        do {
            try failingStore.moveWorkoutExercise(workoutId: current.id, exerciseId: second, direction: -1, orderedExerciseIds: snapshot)
            preconditionFailure("failed persistence must reject a group move")
        } catch is CocoaError {}
        precondition(failingStore.state.workouts == fixture.workouts && failingStore.state.plans == fixture.plans,
                     "failed atomic writes preserve the original interleaved order and all source data")
    }


    // MARK: - v3 checks

    static func near(_ lhs: Double?, _ rhs: Double, _ tolerance: Double = 1e-9) -> Bool {
        guard let lhs else { return false }
        return abs(lhs - rhs) <= tolerance
    }

    @MainActor
    static func checkExerciseIdNormalization(in directory: URL) throws {
        var legacy = AppState.starter()
        // 旧版随机 ID 的内置动作 + 重复的同名内置动作 + 目录扩展动作的旧 ID + 同名自定义动作
        legacy.exercises.removeAll { $0.id == "barbell_bench" || $0.id == "builtin:bodyweight_squat" }
        legacy.exercises.append(contentsOf: [
            Exercise(id: "legacy-bench", name: "杠铃卧推", muscle: "胸", equipment: "杠铃"),
            Exercise(id: "legacy-bench-2", name: "杠铃卧推", muscle: "胸", equipment: "杠铃"),
            Exercise(id: "legacy-squat", name: "自重深蹲", muscle: "腿", equipment: "自重"),
            Exercise(id: "custom-bench", name: "杠铃卧推", muscle: "胸", equipment: "杠铃", isCustom: true),
        ])
        legacy.plans[0].items[0].exerciseId = "legacy-bench"
        legacy.plans[0].items.append(PlanItem(exerciseId: "legacy-bench-2", sets: 2, reps: 5, weight: 40))
        legacy.plans[0].items.append(PlanItem(exerciseId: "custom-bench", sets: 2, reps: 5, weight: 40))
        legacy.workouts = [Workout(id: "legacy-workout", name: "旧训练", endedAt: .now, sets: [
            TrainingSet(id: "l1", exerciseId: "legacy-bench-2", setNumber: 1, weight: 50, reps: 5, completed: true),
            TrainingSet(id: "l2", exerciseId: "legacy-squat", setNumber: 1, weight: 0, reps: 20, completed: true),
            TrainingSet(id: "l3", exerciseId: "custom-bench", setNumber: 1, weight: 30, reps: 5, completed: true),
        ])]

        var pure = legacy
        let remap = pure.normalizeExerciseIds()
        precondition(remap == ["legacy-bench": "barbell_bench", "legacy-bench-2": "barbell_bench", "legacy-squat": "builtin:bodyweight_squat"],
                     "starter names map to slugs, extra catalog names to builtin IDs, customs are untouched")
        precondition(pure.exercises.filter { $0.name == "杠铃卧推" && !$0.isCustom }.map(\.id) == ["barbell_bench"], "duplicate built-ins merge into one")
        precondition(pure.exercises.contains { $0.id == "custom-bench" && $0.isCustom }, "same-name custom exercise keeps its ID")
        precondition(pure.normalizeExerciseIds().isEmpty, "normalization is idempotent")

        let file = directory.appendingPathComponent("normalize.json")
        try JSONEncoder().encode(legacy).write(to: file)
        let store = TrainingStore(fileURL: file)
        let ids = store.state.exercises.map(\.id)
        precondition(Set(ids).count == ids.count && store.state.exercises.count == 56, "upgrade yields 30 starters + 25 extras + 1 custom without duplicates")
        precondition(!ids.contains { $0.hasPrefix("legacy-") }, "legacy IDs are gone after upgrade")
        let items = store.state.plans[0].items.map(\.exerciseId)
        precondition(items.first == "barbell_bench" && items.suffix(2) == ["barbell_bench", "custom-bench"], "plan item references follow the canonical IDs")
        precondition(store.state.workouts[0].sets.map(\.exerciseId) == ["barbell_bench", "builtin:bodyweight_squat", "custom-bench"], "set references follow the canonical IDs")
        precondition(store.state.workouts[0].volume == 400, "history survives normalization")
        precondition(TrainingStore(fileURL: file).state.exercises.map(\.id) == ids, "normalized IDs persist")

        // 被自定义动作占用的规范 ID 不会被抢走
        var blocked = AppState(exercises: [
            Exercise(id: "plank", name: "我的平板", muscle: "核心", equipment: "自重", isCustom: true),
            Exercise(id: "legacy-plank", name: "平板支撑", muscle: "核心", equipment: "自重"),
        ], plans: [], workouts: [], bodyEntries: [], foodEntries: [])
        blocked.normalizeExerciseIds()
        precondition(blocked.exercises.map(\.id) == ["plank", "legacy-plank"], "a canonical ID held by a custom exercise is never reassigned")

        // 替换恢复同样规范化
        let restoreFile = directory.appendingPathComponent("normalize-restore.json")
        let restoreStore = TrainingStore(fileURL: restoreFile)
        try restoreStore.restoreBackup(TrainingBackup.encode(legacy))
        precondition(restoreStore.state.workouts[0].sets.map(\.exerciseId) == ["barbell_bench", "builtin:bodyweight_squat", "custom-bench"], "replace restore normalizes IDs")
        precondition(restoreStore.state.exercises.filter { $0.name == "杠铃卧推" }.count == 2, "restore keeps one built-in and one custom bench")
    }

    @MainActor
    static func checkBackupV3(in directory: URL) throws {
        func reject(_ object: Any, _ fragment: String) {
            do {
                _ = try TrainingBackup.parse(JSONSerialization.data(withJSONObject: object))
                preconditionFailure("backup must be rejected: \(fragment)")
            } catch {
                precondition(error.localizedDescription.contains(fragment), "expected \(fragment), got \(error.localizedDescription)")
            }
        }
        let started = Date(timeIntervalSince1970: 1_762_387_200)
        var state = AppState.starter()
        state.plans = [Plan(id: "plan-v3", name: "推", createdAt: started, items: [PlanItem(id: "item-v3", exerciseId: "barbell_bench", sets: 3, reps: 8, weight: 60)])]
        state.workouts = [Workout(id: "w-v3", planId: "plan-v3", name: "推", startedAt: started, endedAt: started.addingTimeInterval(1800), sets: [
            TrainingSet(id: "s-warm", exerciseId: "barbell_bench", setNumber: 1, weight: 30, reps: 10, completed: true, unit: .reps, restSeconds: 60, kind: .warmup),
            TrainingSet(id: "s-work", exerciseId: "barbell_bench", setNumber: 1, weight: 60, reps: 8, completed: true, unit: .reps, restSeconds: 90, rpe: 8.5),
            TrainingSet(id: "s-plain", exerciseId: "barbell_bench", setNumber: 2, weight: 60, reps: 8, unit: .reps, restSeconds: 90),
        ])]
        state.preferences = AppPreferences(weightUnit: .lb, calorieGoal: 2200, proteinGoal: 150)
        let data = try TrainingBackup.encode(state, exportedAt: started)
        let root = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let rows = (root["tables"] as! [String: Any])["workout_sets"] as! [[String: Any]]
        precondition(rows.map { $0["kind"] as? String } == ["warmup", "working", "working"], "kind is exported for every set")
        precondition(rows[1]["rpe"] as? Double == 8.5 && rows[0]["rpe"] is NSNull, "rpe is exported as a number or null")
        let prefs = root["preferences"] as! [String: Any]
        precondition(prefs["weightUnit"] as? String == "lb" && prefs["calorieGoal"] as? Int == 2200 && prefs["proteinGoal"] as? Int == 150, "preferences are exported")
        let parsed = try TrainingBackup.parse(data)
        precondition(parsed.state.workouts[0].sets == state.workouts[0].sets, "kind and rpe round-trip")
        precondition(parsed.state.preferences == state.preferences && parsed.preview.hasPreferences, "preferences round-trip")
        precondition(parsed.state.workouts[0].volume == 480, "round-tripped warm-ups stay out of volume")

        var unset = state
        unset.preferences = AppPreferences()
        let unsetRoot = try JSONSerialization.jsonObject(with: TrainingBackup.encode(unset)) as! [String: Any]
        precondition((unsetRoot["preferences"] as! [String: Any])["weightUnit"] == nil, "an unset unit is omitted and read back as kg")
        let unsetParsed = try TrainingBackup.parse(TrainingBackup.encode(unset))
        precondition(unsetParsed.state.preferences.weightUnitSetting == nil && unsetParsed.state.preferences.weightUnit == .kg, "missing unit defaults to kg")

        // 旧备份：没有 kind / rpe / preferences
        let old = try JSONSerialization.jsonObject(with: data, options: .mutableContainers) as! NSMutableDictionary
        old.removeObject(forKey: "preferences")
        for row in ((old["tables"] as! NSMutableDictionary)["workout_sets"] as! NSMutableArray) {
            (row as! NSMutableDictionary).removeObject(forKey: "kind")
            (row as! NSMutableDictionary).removeObject(forKey: "rpe")
        }
        let oldData = try JSONSerialization.data(withJSONObject: old)
        let oldParsed = try TrainingBackup.parse(oldData)
        precondition(oldParsed.state.workouts[0].sets.allSatisfy { $0.kind == .working && $0.rpe == nil } && !oldParsed.preview.hasPreferences, "old backups default to working sets without RPE")
        let file = directory.appendingPathComponent("backup-v3.json")
        let store = TrainingStore(fileURL: file)
        try store.setPreferences(AppPreferences(weightUnit: .lb, calorieGoal: 1800, proteinGoal: 0))
        try store.restoreBackup(oldData)
        precondition(store.state.preferences == AppPreferences(weightUnit: .lb, calorieGoal: 1800, proteinGoal: 0), "old backups keep the local preferences")
        try store.restoreBackup(TrainingBackup.encode(unset))
        precondition(store.state.preferences == AppPreferences(), "v3 backups replace preferences")

        // 旧 training.json：没有 kind / rpe / preferences，或偏好字段异常，都能读出训练数据
        var legacyRaw = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as! [String: Any]
        legacyRaw.removeValue(forKey: "preferences")
        legacyRaw["workouts"] = (legacyRaw["workouts"] as! [[String: Any]]).map { workout in
            var workout = workout
            workout["sets"] = (workout["sets"] as! [[String: Any]]).map { set in
                var set = set; set.removeValue(forKey: "kind"); set.removeValue(forKey: "rpe"); return set
            }
            return workout
        }
        let legacyFile = directory.appendingPathComponent("legacy-v2.json")
        try JSONSerialization.data(withJSONObject: legacyRaw).write(to: legacyFile)
        let legacyStore = TrainingStore(fileURL: legacyFile)
        precondition(legacyStore.state.workouts.first?.sets.allSatisfy { $0.kind == .working && $0.rpe == nil } == true, "v2 store files decode with working sets")
        precondition(legacyStore.state.preferences == AppPreferences() && legacyStore.state.plans.map(\.id) == ["plan-v3"], "v2 store files decode with default preferences")
        legacyRaw["preferences"] = ["weightUnit": "stone", "calorieGoal": "lots"]
        try JSONSerialization.data(withJSONObject: legacyRaw).write(to: legacyFile)
        precondition(TrainingStore(fileURL: legacyFile).state.plans.map(\.id) == ["plan-v3"], "malformed local preferences never discard training data")

        // 字段校验
        func mutated(_ change: (NSMutableDictionary) -> Void) -> NSMutableDictionary {
            let copy = try! JSONSerialization.jsonObject(with: data, options: .mutableContainers) as! NSMutableDictionary
            change(copy)
            return copy
        }
        func table(_ root: NSMutableDictionary, _ name: String) -> NSMutableDictionary {
            ((root["tables"] as! NSMutableDictionary)[name] as! NSMutableArray)[0] as! NSMutableDictionary
        }
        reject(mutated { table($0, "workout_sets")["weight"] = -1 }, "重量不能为负数")
        reject(mutated { table($0, "workout_sets")["weight"] = "60" }, "weight 无效")
        reject(mutated { table($0, "workout_sets")["reps"] = 2.5 }, "reps 无效")
        reject(mutated { table($0, "workout_sets")["reps"] = -3 }, "次数不能为负数")
        reject(mutated { table($0, "workout_sets")["setNumber"] = -1 }, "组号不能为负数")
        reject(mutated { table($0, "workout_sets")["sortOrder"] = -1 }, "排序不能为负数")
        reject(mutated { table($0, "workout_sets")["restSeconds"] = -5 }, "休息时间不能为负数")
        reject(mutated { table($0, "workout_sets")["completed"] = 2 }, "completed 无效")
        reject(mutated { table($0, "workout_sets")["kind"] = "cooldown" }, "组次类型")
        for rpe in [4.5, 10.5, 7.25] as [Any] + ["8"] {
            reject(mutated { table($0, "workout_sets")["rpe"] = rpe }, "RPE")
        }
        reject(mutated { table($0, "plan_items")["sets"] = -1 }, "组数不能为负数")
        reject(mutated { table($0, "plan_items")["weight"] = -0.5 }, "重量不能为负数")
        reject(mutated { table($0, "exercises")["isCustom"] = "0" }, "isCustom 无效")
        reject(mutated { table($0, "exercises")["name"] = 3 }, "name 无效")
        reject(mutated { table($0, "workouts")["startedAt"] = "yesterday" }, "日期无效")
        reject(mutated { table($0, "plan_items")["unit"] = "minutes" }, "计次单位")
        reject(mutated { $0["preferences"] = "lb" }, "偏好设置")
        reject(mutated { ($0["preferences"] as! NSMutableDictionary)["weightUnit"] = "stone" }, "偏好设置")
        reject(mutated { ($0["preferences"] as! NSMutableDictionary)["calorieGoal"] = -1 }, "偏好设置")
        reject(mutated { ($0["preferences"] as! NSMutableDictionary)["proteinGoal"] = 1.5 }, "偏好设置")
        let foodAndBody = mutated { root in
            let tables = root["tables"] as! NSMutableDictionary
            tables["body_entries"] = [["id": "b", "recordedAt": "2026-11-01T00:00:00Z", "weight": 70, "bodyFat": -1]]
        }
        reject(foodAndBody, "体脂率不能为负数")
        let negativeFood = mutated { root in
            (root["tables"] as! NSMutableDictionary)["food_entries"] = [["id": "f", "loggedAt": "2026-11-01T00:00:00Z", "meal": "早餐", "name": "蛋", "portion": "1", "calories": -10, "protein": 1, "carbs": 1, "fat": 1]]
        }
        reject(negativeFood, "热量不能为负数")
        // 旧版本可能存有超出现行输入上限的值：仍可导入
        let legacyLimits = mutated { root in
            table(root, "workout_sets")["weight"] = 2100
            table(root, "workout_sets")["reps"] = 1200
            table(root, "workout_sets")["restSeconds"] = 900
            table(root, "plan_items")["sets"] = 25
            table(root, "plan_items")["sets"] = 0
            table(root, "workouts")["planId"] = "deleted-plan"
            (root["preferences"] as! NSMutableDictionary)["calorieGoal"] = 20000
            (root["tables"] as! NSMutableDictionary)["body_entries"] = [["id": "b", "recordedAt": "2026-11-01T00:00:00Z", "weight": 2500, "bodyFat": 120]]
        }
        let lenient = try TrainingBackup.parse(JSONSerialization.data(withJSONObject: legacyLimits))
        let lenientSet = lenient.state.workouts[0].sets.first { $0.id == "s-warm" }!
        precondition(lenientSet.weight == 2100 && lenientSet.reps == 1200 && lenientSet.restSeconds == 900, "import does not enforce input upper bounds")
        precondition(lenient.state.plans[0].items[0].sets == 0 && lenient.state.bodyEntries[0].bodyFat == 120, "zero sets and large body values import")
        precondition(lenient.state.workouts[0].planId == nil, "a workout pointing at a missing plan imports with a null plan")
        precondition(lenient.state.preferences.calorieGoal == 10000, "oversized goals clamp to the editable maximum")
    }

    @MainActor
    static func checkMergeImport(in directory: URL) throws {
        let day = Date(timeIntervalSince1970: 1_762_387_200)
        var local = AppState.starter()
        local.exercises.append(Exercise(id: "custom-local", name: "我的动作", muscle: "自定义", equipment: "自定义", isCustom: true))
        local.plans.append(Plan(id: "plan-shared", name: "本机计划", items: [PlanItem(id: "shared-item", exerciseId: "barbell_bench", sets: 3, reps: 8, weight: 50)]))
        local.workouts = [Workout(id: "w-shared", name: "本机训练", startedAt: day, endedAt: day, note: "本机", sets: [
            TrainingSet(id: "shared-set", exerciseId: "barbell_bench", setNumber: 1, weight: 50, reps: 8, completed: true)
        ])]
        local.bodyEntries = [BodyEntry(id: "b-shared", recordedAt: day, weight: 70)]
        local.trainingSchedule = [ScheduledTraining(planId: "plan-shared", day: "2026-11-10")]
        local.favoritePlanIds = ["plan-shared"]
        local.preferences = AppPreferences(weightUnit: nil, calorieGoal: 1800, proteinGoal: 0)
        let file = directory.appendingPathComponent("merge.json")
        try JSONEncoder().encode(local).write(to: file)
        let store = TrainingStore(fileURL: file)
        precondition(store.state.weeklyGoalDays == nil, "local weekly goal starts unset")

        var backup = AppState.starter()
        backup.exercises.removeAll { $0.id == "barbell_bench" }
        backup.exercises.append(contentsOf: [
            Exercise(id: "phone-bench", name: "杠铃卧推", muscle: "胸", equipment: "杠铃"),
            Exercise(id: "custom-phone-a", name: "我的动作", muscle: "自定义", equipment: "自定义", isCustom: true),
            Exercise(id: "custom-phone-b", name: "新动作", muscle: "自定义", equipment: "自定义", isCustom: true),
        ])
        backup.plans = [
            Plan(id: "plan-shared", name: "备份计划", items: [PlanItem(id: "backup-shared-item", exerciseId: "phone-bench", sets: 5, reps: 5, weight: 80)]),
            Plan(id: "plan-new", name: "新计划", items: [
                PlanItem(id: "shared-item", exerciseId: "phone-bench", sets: 3, reps: 8, weight: 60),
                PlanItem(id: "new-item-a", exerciseId: "custom-phone-a", sets: 3, reps: 10, weight: 10),
                PlanItem(id: "new-item-b", exerciseId: "custom-phone-b", sets: 3, reps: 10, weight: 10),
            ]),
        ]
        backup.workouts = [
            Workout(id: "w-shared", name: "备份训练", startedAt: day, endedAt: day, note: "备份", sets: []),
            Workout(id: "w-new", planId: "plan-new", name: "新训练", startedAt: day.addingTimeInterval(86400), endedAt: day.addingTimeInterval(90000), sets: [
                TrainingSet(id: "shared-set", exerciseId: "phone-bench", setNumber: 1, weight: 60, reps: 8, completed: true),
                TrainingSet(id: "new-set-b", exerciseId: "custom-phone-a", setNumber: 1, weight: 10, reps: 10, completed: true, kind: .warmup),
            ]),
            Workout(id: "w-draft", name: "进行中", startedAt: day, sets: [TrainingSet(exerciseId: "phone-bench", setNumber: 1, weight: 20, reps: 5)]),
        ]
        backup.bodyEntries = [BodyEntry(id: "b-shared", recordedAt: day, weight: 99), BodyEntry(id: "b-new", recordedAt: day, weight: 71)]
        backup.foodEntries = [FoodEntry(id: "f-new", loggedAt: day, meal: "早餐", name: "鸡蛋", portion: "2个", calories: 140, protein: 12, carbs: 1, fat: 10)]
        backup.trainingSchedule = [ScheduledTraining(planId: "plan-shared", day: "2026-11-10"), ScheduledTraining(planId: "plan-new", day: "2026-11-12")]
        backup.favoritePlanIds = ["plan-new", "plan-shared"]
        backup.weeklyGoalDays = 4
        backup.preferences = AppPreferences(weightUnit: .lb, calorieGoal: 2500, proteinGoal: 160)
        let data = try TrainingBackup.encode(backup, exportedAt: day)

        let summary = try store.mergeBackup(data)
        precondition(summary.workouts == 1 && summary.plans == 1 && summary.bodyEntries == 1 && summary.foodEntries == 1 && summary.exercises == 1,
                     "merge adds only records whose IDs are new (normalized built-ins and same-name customs are not added)")
        precondition(summary.skippedUnfinishedWorkouts == 1 && summary.scheduleEntries == 1 && summary.favorites == 1, "unfinished workouts are skipped; schedule and favorites are unioned")
        precondition(summary.message == "新增 1 次训练、1 个计划、1 条身体记录、1 条饮食记录、1 个动作、1 项训练安排、1 个收藏计划；跳过 1 次未结束的训练。", summary.message)
        let state = store.state
        precondition(state.plans.first { $0.id == "plan-shared" }?.name == "本机计划", "existing plans keep the local version")
        precondition(state.workouts.first { $0.id == "w-shared" }?.note == "本机" && !state.workouts.contains { $0.id == "w-draft" }, "existing workouts keep the local version and drafts are skipped")
        precondition(state.bodyEntries.first { $0.id == "b-shared" }?.weight == 70, "existing body entries are kept")
        let newPlan = state.plans.first { $0.id == "plan-new" }!
        precondition(newPlan.items.map(\.exerciseId) == ["barbell_bench", "custom-local", "custom-phone-b"], "plan items use normalized and remapped exercise IDs")
        precondition(newPlan.items[0].id != "shared-item" && newPlan.items[1].id == "new-item-a", "colliding item IDs get fresh IDs")
        let newWorkout = state.workouts.first { $0.id == "w-new" }!
        precondition(newWorkout.sets.map(\.exerciseId) == ["barbell_bench", "custom-local"] && newWorkout.sets[1].kind == .warmup, "merged sets are remapped and keep their kind")
        precondition(newWorkout.sets[0].id != "shared-set" && newWorkout.planId == "plan-new", "colliding set IDs get fresh IDs")
        precondition(!state.exercises.contains { $0.id == "custom-phone-a" || $0.id == "phone-bench" } && state.exercises.contains { $0.id == "custom-phone-b" }, "only the new custom exercise is added")
        precondition(state.trainingSchedule == [ScheduledTraining(planId: "plan-shared", day: "2026-11-10"), ScheduledTraining(planId: "plan-new", day: "2026-11-12")], "schedule union")
        precondition(state.favoritePlanIds == ["plan-shared", "plan-new"], "favorite union keeps the local order first")
        precondition(state.weeklyGoalDays == 4 && summary.adoptedWeeklyGoal, "an unset local weekly goal adopts the backup value")
        precondition(state.preferences == AppPreferences(weightUnit: .lb, calorieGoal: 1800, proteinGoal: 160) && summary.adoptedPreferences,
                     "local preferences win; unset fields adopt the backup values")

        let again = try store.mergeBackup(data)
        precondition(again.totalAdded == 0 && again.message == "没有需要合并的新记录；跳过 1 次未结束的训练。", "merging the same backup twice adds nothing")
        let reopened = TrainingStore(fileURL: file)
        precondition(reopened.state.workouts.count == 2 && reopened.state.plans.count == 5 && reopened.state.preferences.weightUnit == .lb, "merge persists")

        do {
            try store.mergeBackup(Data("{\"app\":\"lianji\",\"version\":1,\"tables\":{}}".utf8))
            preconditionFailure("invalid backups cannot be merged")
        } catch {}
        precondition(store.state.workouts.count == 2, "a rejected merge changes nothing")
    }

    @MainActor
    static func checkSnapshots(in directory: URL) throws {
        let folder = directory.appendingPathComponent("snapshot-check", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("training.json")
        let store = TrainingStore(fileURL: file)
        precondition(store.latestSnapshot == nil && store.importSnapshots.isEmpty, "fresh stores have nothing to undo")
        do {
            try store.undoLastImport()
            preconditionFailure("undo without a snapshot must fail")
        } catch ImportUndoError.noSnapshot {}
        try store.setWeeklyGoal(3)
        try store.setCalorieGoal(1900)
        let originalPlans = store.state.plans.map(\.id)

        var other = AppState.starter()
        other.plans = [Plan(id: "snap-plan", name: "快照计划", items: [PlanItem(exerciseId: "barbell_bench", sets: 3, reps: 5, weight: 40)])]
        other.weeklyGoalDays = 5
        other.preferences = AppPreferences(weightUnit: .lb)
        let data = try TrainingBackup.encode(other)

        try store.restoreBackup(data)
        precondition(store.state.plans.map(\.id) == ["snap-plan"] && store.state.weeklyGoalDays == 5, "replace restore applied")
        precondition(store.importSnapshots.count == 1 && store.latestSnapshot?.reason == .replace, "replace writes a snapshot first")
        let restored = try store.undoLastImport()
        precondition(restored.reason == .replace && store.latestSnapshot == nil && store.importSnapshots.isEmpty, "undo deletes the snapshot it used")
        precondition(store.state.plans.map(\.id) == originalPlans && store.state.weeklyGoalDays == 3, "undo restores the pre-import data")
        precondition(store.state.preferences == AppPreferences(weightUnit: nil, calorieGoal: 1900), "undo restores preferences, including an unset unit")
        precondition(TrainingStore(fileURL: file).state.plans.map(\.id) == originalPlans, "undo persists")

        try store.mergeBackup(data)
        precondition(store.state.plans.contains { $0.id == "snap-plan" } && store.latestSnapshot?.reason == .merge, "merge writes a snapshot first")
        try store.undoLastImport()
        precondition(store.state.plans.map(\.id) == originalPlans, "undoing a merge removes the merged records")

        for _ in 0..<4 { try store.mergeBackup(data) }
        let snapshots = store.importSnapshots
        precondition(snapshots.count == ImportSnapshotStore.limit && snapshots.allSatisfy { $0.reason == .merge }, "at most three snapshots are kept")
        precondition(zip(snapshots, snapshots.dropFirst()).allSatisfy { $0.createdAt > $1.createdAt }, "snapshots are listed newest first")
        precondition(store.latestSnapshot == snapshots.first, "latest snapshot is the newest file")

        do {
            try store.restoreBackup(Data("not json".utf8))
            preconditionFailure("invalid backups cannot be restored")
        } catch {}
        precondition(store.importSnapshots == snapshots, "a rejected backup writes no snapshot")

        try FileManager.default.setAttributes([.immutable: true], ofItemAtPath: file.path)
        defer { try? FileManager.default.setAttributes([.immutable: false], ofItemAtPath: file.path) }
        do {
            try store.restoreBackup(data)
            preconditionFailure("a locked store file must reject restore")
        } catch {}
        precondition(store.importSnapshots == snapshots, "a failed restore removes its snapshot and keeps older ones")
        try FileManager.default.setAttributes([.immutable: false], ofItemAtPath: file.path)

        try store.undoLastImport()
        precondition(store.importSnapshots.count == 2 && store.latestSnapshot == snapshots[1], "undo walks back one snapshot at a time")
        precondition(TrainingStore(fileURL: file).latestSnapshot == snapshots[1], "snapshots are rediscovered on launch")
    }

    @MainActor
    static func checkWarmupsAndEstimatedMax(in directory: URL) throws {
        precondition(StrengthMath.estimatedOneRepMax(weight: 100, reps: 1) == 100, "one rep equals the weight")
        precondition(near(StrengthMath.estimatedOneRepMax(weight: 100, reps: 10), 133.33333333333334), "Epley formula")
        precondition(near(StrengthMath.estimatedOneRepMax(weight: 60, reps: 12), 84), "twelve reps still count")
        precondition(StrengthMath.estimatedOneRepMax(weight: 100, reps: 13) == nil && StrengthMath.estimatedOneRepMax(weight: 0, reps: 5) == nil
                     && StrengthMath.estimatedOneRepMax(weight: 50, reps: 0) == nil, "out-of-range reps and zero weight are excluded")
        precondition(StrengthMath.estimatedOneRepMax(TrainingSet(exerciseId: "x", setNumber: 1, weight: 50, reps: 5, completed: true, unit: .seconds)) == nil
                     && StrengthMath.estimatedOneRepMax(TrainingSet(exerciseId: "x", setNumber: 1, weight: 50, reps: 5, completed: true, kind: .warmup)) == nil
                     && StrengthMath.estimatedOneRepMax(TrainingSet(exerciseId: "x", setNumber: 1, weight: 50, reps: 5)) == nil,
                     "timed, warm-up and incomplete sets have no estimate")

        let monday = Date(timeIntervalSince1970: 1_772_409_600) // 2026-03-02
        let bench = "barbell_bench"
        let heavy = Workout(id: "warm-heavy", planId: "plan-warm", name: "卧推", startedAt: monday, endedAt: monday.addingTimeInterval(3600), sets: [
            TrainingSet(id: "w0", exerciseId: bench, setNumber: 1, weight: 100, reps: 5, completed: true, kind: .warmup),
            TrainingSet(id: "w1", exerciseId: bench, setNumber: 1, weight: 60, reps: 5, completed: true),
            TrainingSet(id: "w2", exerciseId: bench, setNumber: 2, weight: 62.5, reps: 8, completed: true),
            TrainingSet(id: "w3", exerciseId: bench, setNumber: 3, weight: 80, reps: 15, completed: true),
            TrainingSet(id: "w4", exerciseId: bench, setNumber: 4, weight: 90, reps: 1),
            TrainingSet(id: "w5", exerciseId: "warmup_only", setNumber: 1, weight: 40, reps: 10, completed: true, kind: .warmup),
        ])
        precondition(heavy.volume == 2000, "volume excludes warm-ups")
        precondition(heavy.completedSets.count == 5 && heavy.completedWorkingSets.count == 3, "completed sets include warm-ups; working sets do not")
        precondition(heavy.workingSetOrdinal(of: "w2") == 2 && heavy.workingSetOrdinal(of: "w0") == nil, "working ordinals skip warm-ups")
        let warmOnly = Workout(id: "warm-only", name: "只热身", startedAt: monday.addingTimeInterval(86400), endedAt: monday.addingTimeInterval(90000), sets: [
            TrainingSet(exerciseId: bench, setNumber: 1, weight: 200, reps: 1, completed: true, kind: .warmup)
        ])
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let progress = TrainingProgress(workouts: [heavy, warmOnly], calendar: calendar)
        let week = progress.week(containing: monday)
        precondition(week.activeDays() == 2, "a workout with only completed warm-ups still counts as a training day")
        let records = progress.exercise(bench)
        precondition(records.records.heaviestSet?.id == "w3" && records.records.value(.weight) == 80, "warm-ups never become personal records")
        precondition(near(records.records.bestEstimatedOneRepMax, 62.5 * (1 + 8.0 / 30)) && records.records.bestEstimatedOneRepMaxSet?.id == "w2", "best e1RM uses completed working sets with 1–12 reps")
        precondition(records.records.label(.estimatedOneRepMax) == "79 kg" && records.records.label(.estimatedOneRepMax, unit: .lb) == "175 lb", "e1RM displays rounded to 0.5 kg / 1 lb")
        precondition(records.recentByMetric[.estimatedOneRepMax]?.map(\.id) == ["warm-heavy"], "per-session e1RM points skip warm-up-only sessions")
        precondition(records.recent.map(\.id) == ["warm-heavy"], "warm-up-only sessions are not progress points")
        precondition(!progress.exerciseOptions(AppState.starter().exercises + [Exercise(id: "warmup_only", name: "热身", muscle: "", equipment: "", isCustom: true)]).contains { $0.id == "warmup_only" },
                     "exercises with only warm-ups have no progress entry")

        let current = Workout(id: "warm-current", planId: "plan-warm", name: "卧推", startedAt: monday.addingTimeInterval(200000), sets: [
            TrainingSet(id: "c-warm", exerciseId: bench, setNumber: 1, weight: 20, reps: 10, kind: .warmup),
            TrainingSet(id: "c1", exerciseId: bench, setNumber: 1, weight: 0, reps: 5),
            TrainingSet(id: "c2", exerciseId: bench, setNumber: 2, weight: 0, reps: 5),
        ])
        let comparison = TrainingComparison(workouts: [heavy, warmOnly, current])
        let reference = comparison.previousExerciseSets(for: current)[bench]!.first!
        precondition(reference.workout.id == "warm-heavy" && reference.sets.map(\.id) == ["w1", "w2", "w3"], "previous sets skip warm-ups and warm-up-only sessions")
        precondition(reference.reusableSet(for: current.sets[0], in: current) == nil, "warm-up rows have no reuse action")
        precondition(reference.reusableSet(for: current.sets[1], in: current)?.set.id == "w1"
                     && reference.reusableSet(for: current.sets[2], in: current)?.set.id == "w2", "reuse ordinals count working rows only")
        var finished = current
        finished.endedAt = finished.startedAt
        finished.sets = finished.sets.map { var set = $0; set.completed = true; set.weight = 50; return set }
        let plan = TrainingComparison(workouts: [heavy, warmOnly, finished]).previousPlanWorkout(for: finished)!
        precondition(plan.previous.completedSets == 3 && plan.previous.volume == 2000 && plan.current.completedSets == 2 && plan.current.volume == 500,
                     "same-plan comparison excludes warm-ups")

        var fixture = AppState.starter()
        fixture.workouts = [heavy, warmOnly]
        let file = directory.appendingPathComponent("warmups.json")
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        let saved = try store.saveWorkoutAsPlan("warm-heavy")
        precondition(saved.items.map(\.exerciseId) == [bench] && saved.items[0].sets == 3 && saved.items[0].weight == 80, "save-as-plan ignores warm-ups")
        do {
            try store.saveWorkoutAsPlan("warm-only")
            preconditionFailure("warm-up-only workouts cannot become plans")
        } catch WorkoutPlanError.empty {}
    }

    @MainActor
    static func checkProgression(in directory: URL) throws {
        let bench = Exercise(id: "barbell_bench", name: "杠铃卧推", muscle: "胸", equipment: "杠铃")
        let squat = Exercise(id: "barbell_squat", name: "杠铃深蹲", muscle: "腿", equipment: "杠铃")
        let plan = Plan(id: "prog-plan", name: "力量", items: [
            PlanItem(exerciseId: bench.id, sets: 3, reps: 8, weight: 60),
            PlanItem(exerciseId: squat.id, sets: 3, reps: 5, weight: 100),
        ])
        func session(_ id: String, _ day: Double, planId: String? = "prog-plan", _ sets: [TrainingSet]) -> Workout {
            let start = Date(timeIntervalSince1970: 1_772_409_600 + day * 86400)
            return Workout(id: id, planId: planId, name: id, startedAt: start, endedAt: start.addingTimeInterval(3600), sets: sets)
        }
        func set(_ exercise: Exercise, _ weight: Double, _ reps: Int, done: Bool = true, kind: SetKind = .working, unit: TrainingUnit? = nil) -> TrainingSet {
            TrainingSet(exerciseId: exercise.id, setNumber: 1, weight: weight, reps: reps, completed: done, unit: unit, kind: kind)
        }
        func suggest(_ exercise: Exercise, _ workouts: [Workout], unit: WeightUnit = .kg, plans: [Plan]? = nil) -> ProgressionSuggestion? {
            ProgressionAdvisor.suggestion(for: exercise.id, exercise: exercise, workouts: workouts, plans: plans ?? [plan], unit: unit)
        }
        let achieved = session("achieved", 0, [set(bench, 40, 5, done: false, kind: .warmup), set(bench, 60, 8), set(bench, 60, 9), set(bench, 57.5, 8)])
        let up = suggest(bench, [achieved])!
        precondition(up.decision == .increase && up.reason == .allCompleted && up.suggestedWeight == 62.5 && up.baseWeight == 60 && up.targetReps == 8,
                     "all working sets done at target: +2.5 kg (incomplete warm-ups ignored)")
        precondition(up.reasonText == "上次全部完成" && up.message(unit: .kg) == "建议 62.5 kg · 上次全部完成", "increase copy")
        precondition(near(suggest(bench, [achieved], unit: .lb)?.suggestedWeight, 60 + 5 * 0.45359237), "lb mode adds 5 lb")
        let squatDay = session("squat", 0, [set(squat, 100, 5), set(squat, 100, 6)])
        precondition(suggest(squat, [squatDay])?.suggestedWeight == 105, "legs add 5 kg")
        precondition(near(suggest(squat, [squatDay], unit: .lb)?.suggestedWeight, 100 + 10 * 0.45359237), "legs add 10 lb in lb mode")

        let shortReps = session("short", 1, [set(bench, 60, 8), set(bench, 60, 7)])
        let hold = suggest(bench, [achieved, shortReps])!
        precondition(hold.decision == .hold && hold.reason == .missedLastTime && hold.suggestedWeight == 60 && hold.sourceWorkoutId == "short",
                     "reps under target after a good session: hold")
        let incomplete = session("incomplete", 2, [set(bench, 60, 8), set(bench, 60, 8, done: false)])
        let deload = suggest(bench, [achieved, shortReps, incomplete])!
        precondition(deload.decision == .deload && deload.reason == .missedTwice && deload.suggestedWeight == 55 && deload.reasonText == "连续两次未完成",
                     "two misses in a row: 60 × 0.9 rounded to 2.5 kg")
        precondition(near(suggest(bench, [achieved, shortReps, incomplete], unit: .lb)?.suggestedWeight, 120 * 0.45359237), "lb deload rounds to 5 lb")

        let free = session("free", 3, planId: nil, [set(bench, 70, 3), set(bench, 70, 2)])
        precondition(suggest(bench, [achieved, shortReps, incomplete, free])?.decision == .increase, "free workouts do not compare reps")
        let removedPlan = Plan(id: "prog-plan", name: "力量", items: [PlanItem(exerciseId: squat.id, sets: 3, reps: 5, weight: 100)])
        let lowReps = session("low", 4, [set(bench, 60, 1), set(bench, 60, 1)])
        precondition(suggest(bench, [lowReps], plans: [removedPlan])?.decision == .increase, "plans that no longer contain the exercise do not compare reps")
        precondition(suggest(bench, [lowReps])?.decision == .hold, "plan targets still apply while the plan has the exercise")
        precondition(suggest(bench, []) == nil, "no history, no suggestion")
        precondition(suggest(bench, [session("zero", 0, [set(bench, 0, 8)])]) == nil, "zero base weight, no suggestion")
        precondition(suggest(bench, [session("timed", 0, [set(bench, 20, 30, unit: .seconds)])]) == nil, "timed exercises get no suggestion")
        precondition(suggest(bench, [session("warm", 0, [set(bench, 60, 8, kind: .warmup)])]) == nil, "warm-up-only history gets no suggestion")
        var draft = achieved
        draft.endedAt = nil
        precondition(suggest(bench, [draft]) == nil, "unfinished workouts are ignored")

        var fixture = AppState.starter()
        fixture.plans.append(plan)
        let activeStart = Date(timeIntervalSince1970: 1_772_409_600 + 10 * 86400)
        fixture.workouts = [achieved, Workout(id: "prog-active", planId: plan.id, name: "力量", startedAt: activeStart, sets: [
            TrainingSet(id: "a-warm", exerciseId: bench.id, setNumber: 1, weight: 20, reps: 10, kind: .warmup),
            TrainingSet(id: "a-done", exerciseId: bench.id, setNumber: 1, weight: 60, reps: 8, completed: true),
            TrainingSet(id: "a-1", exerciseId: bench.id, setNumber: 2, weight: 60, reps: 8),
            TrainingSet(id: "a-2", exerciseId: bench.id, setNumber: 3, weight: 60, reps: 8),
            TrainingSet(id: "a-squat", exerciseId: squat.id, setNumber: 1, weight: 100, reps: 5),
        ])]
        let file = directory.appendingPathComponent("progression.json")
        try JSONEncoder().encode(fixture).write(to: file)
        let store = TrainingStore(fileURL: file)
        let suggestion = store.progressionSuggestion(for: bench.id)!
        precondition(suggestion.suggestedWeight == 62.5 && suggestion.sourceWorkoutId == "achieved", "store suggestion ignores the active workout")
        let filled = try store.applySuggestion(suggestion)
        precondition(filled == 2, "only incomplete working sets are filled")
        let sets = Dictionary(uniqueKeysWithValues: store.activeWorkout!.sets.map { ($0.id, $0.weight) })
        precondition(sets == ["a-warm": 20, "a-done": 60, "a-1": 62.5, "a-2": 62.5, "a-squat": 100], "warm-ups, completed sets and other exercises are untouched")
        precondition(TrainingStore(fileURL: file).activeWorkout?.sets[2].weight == 62.5, "applied weights persist")
        do {
            try store.applySuggestedWeight(2500, to: bench.id)
            preconditionFailure("out-of-range weights are rejected")
        } catch ProgressionApplyError.invalidWeight {}
        store.finishWorkout()
        do {
            try store.applySuggestedWeight(60, to: bench.id)
            preconditionFailure("applying without an active workout fails")
        } catch ProgressionApplyError.unavailable {}
    }

    static func checkWeightUnits() {
        precondition(WeightUnit.lb.toKilograms(1) == 0.45359237 && near(WeightUnit.lb.fromKilograms(0.45359237), 1), "1 lb = 0.45359237 kg")
        precondition(WeightUnit.kg.toKilograms(62.5) == 62.5 && WeightUnit.kg.fromKilograms(62.5) == 62.5, "kg is the storage unit")
        precondition(WeightUnit.kg.format(kilograms: 62.5) == "62.5 kg" && WeightUnit.kg.format(kilograms: 60) == "60 kg"
                     && WeightUnit.kg.format(kilograms: 62.54) == "62.5 kg" && WeightUnit.kg.format(kilograms: 62.56) == "62.6 kg"
                     && WeightUnit.kg.format(kilograms: 1250, includeUnit: false) == "1250", "kg shows one trimmed decimal without grouping")
        precondition(WeightUnit.lb.format(kilograms: 60) == "132.5 lb" && WeightUnit.lb.format(kilograms: 135 * 0.45359237) == "135 lb"
                     && WeightUnit.lb.format(kilograms: 20) == "44 lb", "lb rounds to 0.5")
        precondition(near(WeightUnit.lb.parseKilograms("135"), 61.23496995) && WeightUnit.kg.parseKilograms(" 62,5 ") == 62.5
                     && near(WeightUnit.lb.parseKilograms("135 lb"), 61.23496995), "input parses in the selected unit")
        precondition(WeightUnit.kg.parseKilograms("abc") == nil && WeightUnit.kg.parseKilograms("-5") == nil && WeightUnit.kg.parseKilograms("") == nil
                     && WeightUnit.kg.parseKilograms("inf") == nil, "invalid input is rejected")
        precondition(WeightUnit.lb.format(kilograms: WeightUnit.lb.parseKilograms("137.5")!) == "137.5 lb", "lb input round-trips")
        precondition(WeightUnit.kg.formatEstimatedOneRepMax(kilograms: 79.3) == "79.5 kg" && WeightUnit.lb.formatEstimatedOneRepMax(kilograms: 79.3) == "175 lb",
                     "e1RM rounds to 0.5 kg / 1 lb")
        precondition(WeightUnit.kg.format(kilograms: 0) == "0 kg" && WeightUnit.kg.format(kilograms: -0.0) == "0 kg", "zero formats plainly")
        precondition(ProgressMetric.estimatedOneRepMax.unit(.lb) == "lb" && ProgressMetric.weight.unit == "kg", "metric units follow the weight unit")
    }

    @MainActor
    static func checkV3StoreAPIs(in directory: URL) throws {
        let file = directory.appendingPathComponent("v3-apis.json")
        let store = TrainingStore(fileURL: file)
        store.startWorkout(planId: "starter_push")
        let first = store.activeWorkout!.sets[0]
        store.updateSet(first.id, weight: 2500, reps: 1500)
        precondition(store.activeWorkout!.sets[0].weight == 2000 && store.activeWorkout!.sets[0].reps == 1000, "edits clamp to input limits")
        store.updateSet(first.id, weight: 60, reps: 8)

        let warmId = store.addWarmupSet(for: first.exerciseId)!
        let secondWarmId = store.addWarmupSet(for: first.exerciseId)!
        let rows = store.activeWorkout!.sets.filter { $0.exerciseId == first.exerciseId }
        precondition(rows.prefix(2).map(\.id) == [warmId, secondWarmId] && rows[2].id == first.id, "warm-ups go before the first working set in insertion order")
        precondition(rows[0].kind == .warmup && rows[0].weight == 30 && rows[0].reps == 8 && rows[1].setNumber == 2, "warm-up uses half the working weight")
        precondition(store.addWarmupSet(for: "missing") == nil, "warm-ups need the exercise in the workout")
        store.addSet(for: first.exerciseId)
        let appended = store.activeWorkout!.sets.filter { $0.exerciseId == first.exerciseId }.last!
        precondition(appended.kind == .working && appended.setNumber == 4 && appended.weight == 0, "added sets are working sets copying the last working set")
        store.updateSet(warmId, completed: true)
        store.updateSet(first.id, completed: true)
        precondition(store.activeWorkout!.volume == 480, "completed warm-ups are not volume")
        store.toggleSetKind(warmId)
        precondition(store.activeWorkout!.sets.first { $0.id == warmId }?.kind == .working && store.activeWorkout!.volume == 720, "toggling to working counts the set")
        store.toggleSetKind(warmId)
        store.setSetKind(first.id, .warmup)
        precondition(store.activeWorkout!.volume == 0, "explicit kind changes apply")
        store.setSetKind(first.id, .working)

        try store.setRPE(first.id, 8.5)
        precondition(store.activeWorkout!.sets.first { $0.id == first.id }?.rpe == 8.5, "RPE is stored")
        for invalid in [4.5, 10.5, 7.25, .nan] {
            do {
                try store.setRPE(first.id, invalid)
                preconditionFailure("invalid RPE must be rejected")
            } catch SetEditError.invalidRPE {}
        }
        do {
            try store.setRPE("missing", 8)
            preconditionFailure("stale set IDs are rejected")
        } catch SetEditError.staleSet {}
        precondition(TrainingStore(fileURL: file).activeWorkout?.sets.first { $0.id == first.id }?.rpe == 8.5, "RPE persists")
        try store.setRPE(first.id, nil)
        precondition(store.activeWorkout!.sets.first { $0.id == first.id }?.rpe == nil, "RPE can be cleared")
        precondition(TrainingSet.rpeOptions.count == 11 && TrainingSet.rpeOptions.first == 5 && TrainingSet.rpeOptions.last == 10, "RPE picker options")

        try store.setWeightUnit(.lb)
        try store.setCalorieGoal(2000)
        try store.setProteinGoal(120)
        for action in [{ try store.setCalorieGoal(10001) }, { try store.setCalorieGoal(-1) }, { try store.setProteinGoal(1001) }] {
            do {
                try action()
                preconditionFailure("out-of-range goals are rejected")
            } catch is PreferencesError {}
        }
        let reopened = TrainingStore(fileURL: file)
        precondition(reopened.weightUnit == .lb && reopened.preferences == AppPreferences(weightUnit: .lb, calorieGoal: 2000, proteinGoal: 120), "preferences persist")
        let lbWarm = reopened.addWarmupSet(for: first.exerciseId)!
        precondition(near(reopened.activeWorkout!.sets.first { $0.id == lbWarm }?.weight, 65 * 0.45359237), "lb warm-ups round down to 5 lb")

        let now = Date.now
        let foods = [
            FoodEntry(id: "f1", loggedAt: now.addingTimeInterval(-86400 * 3), meal: "早餐", name: "鸡蛋", portion: "2个", calories: 140, protein: 12, carbs: 1, fat: 10),
            FoodEntry(id: "f2", loggedAt: now.addingTimeInterval(-86400 * 2), meal: "早餐", name: "鸡蛋", portion: "2个", calories: 150, protein: 13, carbs: 1, fat: 10),
            FoodEntry(id: "f3", loggedAt: now.addingTimeInterval(-86400), meal: "加餐", name: " 鸡蛋 ", portion: "2个", calories: 155, protein: 13, carbs: 1, fat: 11),
            FoodEntry(id: "f4", loggedAt: now.addingTimeInterval(-60), meal: "午餐", name: "米饭", portion: "1碗", calories: 200, protein: 4, carbs: 45, fat: 1),
            FoodEntry(id: "f5", loggedAt: now.addingTimeInterval(-120), meal: "早餐", name: "鸡蛋", portion: "1个", calories: 70, protein: 6, carbs: 0.5, fat: 5),
        ]
        let recent = FoodQuickAdd.recent(foods)
        precondition(recent.map(\.name) == ["米饭", "鸡蛋", "鸡蛋"] && recent.map(\.portion) == ["1碗", "1个", "2个"], "recent foods are distinct by name and portion, newest first")
        precondition(recent[2].calories == 155 && recent[2].count == 3 && recent[2].lastMeal == "加餐", "templates use the newest values and count history")
        precondition(FoodQuickAdd.frequent(foods).first?.portion == "2个", "frequent foods sort by count")
        let many = (0..<10).map { FoodEntry(id: "m\($0)", loggedAt: now.addingTimeInterval(Double(-$0)), meal: "加餐", name: "食物\($0)", portion: "1份", calories: 1, protein: 1, carbs: 1, fat: 1) }
        precondition(FoodQuickAdd.recent(many).count == 8 && FoodQuickAdd.recent(many).first?.name == "食物0", "quick-add lists cap at 8")
        for food in foods { reopened.addFoodEntry(food) }
        let relogged = try reopened.relogFood(reopened.recentFoods()[2], meal: "晚餐", at: now)
        precondition(relogged.meal == "晚餐" && relogged.name == "鸡蛋" && relogged.calories == 155 && !foods.contains { $0.id == relogged.id }, "re-log copies values into a new entry")
        precondition(reopened.frequentFoods().first?.count == 4 && reopened.recentFoods().first?.name == "鸡蛋" && reopened.recentFoods().first?.portion == "2个", "re-logged food moves up")
        let today = reopened.nutritionProgress(on: now)
        precondition(today.calorieGoal == 2000 && today.proteinGoal == 120, "goals come from preferences")
        let expectedCalories = foods.filter { Calendar.current.isDate($0.loggedAt, inSameDayAs: now) }.reduce(155) { $0 + $1.calories }
        precondition(today.calories == expectedCalories && near(today.calorieProgress, expectedCalories / 2000) && near(today.remainingCalories, 2000 - expectedCalories),
                     "daily totals compare against the calorie goal")
        try reopened.setCalorieGoal(0)
        precondition(reopened.nutritionProgress(on: now).calorieGoal == nil && reopened.nutritionProgress(on: now).calorieProgress == nil, "a zero goal is unset")

        let suite = "lianji-check-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let device = DeviceSettings(defaults: defaults)
        precondition(device.restNotifications && device.haptics && !device.healthSync, "device defaults")
        device.haptics = false
        device.healthSync = true
        precondition(!DeviceSettings(defaults: defaults).haptics && DeviceSettings(defaults: defaults).healthSync, "device settings persist in UserDefaults")
        let backupPreferences = try TrainingBackup.parse(reopened.exportBackup()).state.preferences
        precondition(defaults.bool(forKey: "device.healthSync") && backupPreferences.weightUnit == .lb, "backed-up preferences are unaffected by device settings")
        let exported = String(decoding: try reopened.exportBackup(), as: UTF8.self)
        precondition(!exported.contains("haptics") && !exported.contains("healthSync"), "device toggles are never exported")
    }
}
