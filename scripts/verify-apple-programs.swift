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
        print("Passed: 34 programs / 69 days; legacy data, persistence, progress, plans, goals, schedules, comparisons, wellness, backup, plan reuse and applying previous groups.")
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

}
