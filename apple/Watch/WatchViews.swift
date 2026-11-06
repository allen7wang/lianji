import SwiftUI

private let lime = Color(red: 0.725, green: 0.953, blue: 0.416)

struct WatchHomeView: View {
    @EnvironmentObject private var store: TrainingStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if let workout = store.activeWorkout {
                        NavigationLink {
                            WatchWorkoutView()
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Label("继续训练", systemImage: "bolt.fill")
                                    .font(.caption.bold()).foregroundStyle(lime)
                                Text(workout.name).font(.headline).lineLimit(2)
                                Text("\(workout.completedSets.count) / \(workout.sets.count) 组")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(7)
                        }
                    } else {
                        Text("今天练什么？").font(.headline)
                        Button {
                            store.startWorkout(planId: nil)
                        } label: {
                            Label("自由训练", systemImage: "plus.circle.fill")
                        }
                    }
                    NavigationLink {
                        WatchPlansView()
                    } label: {
                        Label("训练计划", systemImage: "list.bullet.rectangle")
                    }
                    NavigationLink {
                        WatchScheduleView()
                    } label: {
                        Label("训练安排", systemImage: "calendar.badge.clock")
                    }
                    NavigationLink {
                        WatchProgressView()
                    } label: {
                        Label("训练进度", systemImage: "chart.bar.fill")
                    }
                    if store.activeWorkout == nil {
                        ForEach(store.orderedPlans) { plan in
                            Button {
                                store.startWorkout(planId: plan.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Label(plan.name, systemImage: store.isPlanFavorite(plan.id) ? "star.fill" : "dumbbell")
                                        .font(.subheadline.bold()).lineLimit(2)
                                    Text("\(plan.items.count) 个动作").font(.caption2).foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    NavigationLink {
                        WatchProgramLibrary()
                    } label: {
                        Label("计划模板", systemImage: "square.stack")
                    }
                    NavigationLink {
                        WatchHistoryView()
                    } label: {
                        Label("训练历史", systemImage: "clock.arrow.circlepath")
                    }
                    NavigationLink {
                        WatchBackupView()
                    } label: {
                        Label("数据备份", systemImage: "externaldrive.fill")
                    }
                    NavigationLink {
                        WatchWellnessView()
                    } label: {
                        Label("身体饮食", systemImage: "scalemass")
                    }
                    NavigationLink {
                        WatchDemoLibrary()
                    } label: {
                        Label("动作动图", systemImage: "play.circle")
                    }
                }
            }
            .navigationTitle("练迹")
        }
    }
}

private struct WatchPlansView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var showWorkout = false

    var body: some View {
        List {
            ForEach(store.orderedPlans) { plan in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(plan.name).font(.headline)
                        Spacer(minLength: 3)
                        PlanFavoriteButton(plan: plan)
                    }
                    Text("\(plan.items.count) 个动作").font(.caption2).foregroundStyle(.secondary)
                    if !plan.note.isEmpty {
                        Text(plan.note).font(.caption2).foregroundStyle(.secondary)
                    }
                    Button("开始训练", systemImage: "play.fill") {
                        guard store.activeWorkout == nil else { return }
                        store.startWorkout(planId: plan.id)
                        showWorkout = true
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(store.activeWorkout != nil)
                    DuplicatePlanButton(plan: plan)
                }
            }
            if store.orderedPlans.isEmpty {
                Text("先从计划模板添加一份计划。").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("训练计划")
        .navigationDestination(isPresented: $showWorkout) { WatchWorkoutView() }
    }
}

private struct WatchScheduleView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var showWorkout = false

    var body: some View {
        let items = store.trainingSchedule()
        List {
            NavigationLink {
                WatchScheduleEditor()
            } label: {
                Label("添加安排", systemImage: "plus")
            }
            if items.isEmpty {
                Text("还没有训练安排。").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 5) {
                    Text(item.plan.name).font(.subheadline.bold())
                    Text("\(item.entry.day) · \(item.status.rawValue)")
                        .font(.caption2)
                        .foregroundStyle(item.status == .missed ? .secondary : lime)
                    TrainingScheduleActions(item: item) { showWorkout = true }
                }
            }
        }
        .navigationTitle("训练安排")
        .navigationDestination(isPresented: $showWorkout) { WatchWorkoutView() }
    }
}

private struct WatchScheduleEditor: View {
    @EnvironmentObject private var store: TrainingStore
    @Environment(\.dismiss) private var dismiss
    @State private var offset = 0
    @State private var planId = ""
    @State private var saveFailed = false

    var body: some View {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let date = calendar.date(byAdding: .day, value: offset, to: today) ?? today
        let selectedPlan = store.state.plans.first { $0.id == planId }
        let entry = ScheduledTraining(planId: planId, day: ScheduledTraining.localDay(date))
        let duplicate = store.state.trainingSchedule?.contains(entry) == true

        List {
            if store.state.plans.isEmpty {
                Text("先添加一份训练计划。").font(.caption).foregroundStyle(.secondary)
            } else {
                Picker("日期", selection: $offset) {
                    Text("今天").tag(0)
                    ForEach(1..<7) { day in
                        if let option = calendar.date(byAdding: .day, value: day, to: today) {
                            Text(option.formatted(.dateTime.month().day().weekday(.abbreviated))).tag(day)
                        }
                    }
                }
                .pickerStyle(.navigationLink)
                Picker("计划", selection: Binding(
                    get: { selectedPlan?.id ?? "" },
                    set: { planId = $0 }
                )) {
                    Text("选择计划").tag("")
                    ForEach(store.orderedPlans) { plan in
                        Text(store.isPlanFavorite(plan.id) ? "★ \(plan.name)" : plan.name).tag(plan.id)
                    }
                }
                .pickerStyle(.navigationLink)
                Button(duplicate ? "已安排" : "添加安排") {
                    do {
                        if try store.scheduleTraining(planId: planId, on: date) { dismiss() }
                    } catch { saveFailed = true }
                }
                .disabled(selectedPlan == nil || duplicate)
            }
        }
        .navigationTitle("添加安排")
        .alert("无法添加训练安排", isPresented: $saveFailed) {
            Button("好", role: .cancel) {}
        } message: {
            Text("请重试。")
        }
    }
}

private struct WatchProgramLibrary: View {
    @State private var category = "全部"
    @State private var sport = "全部项目"
    var body: some View {
        List {
            Picker("训练场景", selection: $category) {
                ForEach(TrainingProgram.categories, id: \.self) { Text($0).tag($0) }
            }.onChange(of: category) { sport = "全部项目" }
            if category == "专项力量" {
                Picker("运动项目", selection: $sport) {
                    ForEach(TrainingProgram.sports, id: \.self) { Text($0).tag($0) }
                }
            }
            ForEach(TrainingProgram.catalog.filter { (category == "全部" || $0.category == category) && (category != "专项力量" || sport == "全部项目" || $0.sport == sport) }) { program in
                NavigationLink {
                    WatchProgramPreview(program: program)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(program.name).font(.headline)
                        Text("\(program.days.count) 个训练日 · \(program.level)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }.navigationTitle("计划模板")
    }
}

private struct WatchProgramPreview: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var error: String?
    let program: TrainingProgram
    private var missing: Int { program.missingDays(in: store.state.plans) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(program.description).font(.caption)
                Text("\(program.level) · \(program.equipment.joined(separator: " / "))").font(.caption2).foregroundStyle(.secondary)
                Text(program.frequency).font(.caption2)
                ForEach(program.guidance, id: \.self) { Text($0).font(.caption2).foregroundStyle(.secondary) }
                ForEach(program.days) { day in
                    NavigationLink {
                        WatchProgramDayPreview(day: day)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(day.name).font(.headline)
                            Text("\(day.exercises.count) 个动作").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                Text(program.category == "呼吸训练" ? "按舒适节奏练习，可调整练习秒数。" : "训练日间可休息，重量在训练时按实际填写。").font(.caption2).foregroundStyle(.secondary)
                if let error { Text(error).font(.caption2).foregroundStyle(.red) }
                Button(missing == 0 ? "已添加" : "添加 \(missing) 个训练日") {
                    do { try store.importTemplate(program) }
                    catch { self.error = error.localizedDescription }
                }.disabled(missing == 0)
            }.padding(.horizontal, 4)
        }.navigationTitle(program.name)
    }
}

private struct WatchProgramDayPreview: View {
    let day: ProgramDay
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(day.focus).font(.caption2).foregroundStyle(lime)
                ForEach(day.exercises, id: \.name) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.name).font(.caption.bold())
                        Text("\(item.sets) 组 × \(item.targetLabel)").font(.caption2).foregroundStyle(.secondary)
                        Text("休息 \(item.restSeconds ?? 90) 秒").font(.caption2).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    Divider()
                }
            }
        }.navigationTitle(day.name)
    }
}

private struct WatchWorkoutView: View {
    @EnvironmentObject private var store: TrainingStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            if let workout = store.activeWorkout {
                VStack(alignment: .leading, spacing: 10) {
                    Text(workout.name).font(.headline).lineLimit(2)
                    HStack {
                        Text("\(workout.completedSets.count)/\(workout.sets.count) 组")
                        Spacer()
                        Text("\(Int(workout.volume)) kg")
                    }
                    .font(.caption).foregroundStyle(lime)

                    ForEach(workout.exerciseIds, id: \.self) { exerciseId in
                        NavigationLink {
                            WatchExerciseView(exerciseId: exerciseId)
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(store.exercise(exerciseId)?.name ?? "未知动作").lineLimit(2)
                                Text("\(workout.sets.filter { $0.exerciseId == exerciseId && $0.completed }.count)/\(workout.sets.filter { $0.exerciseId == exerciseId }.count) 组")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                    NavigationLink {
                        WatchExercisePicker()
                    } label: {
                        Label("添加动作", systemImage: "plus")
                    }
                    Button("结束训练") {
                        store.finishWorkout()
                        dismiss()
                    }
                    .disabled(workout.completedSets.isEmpty)
                    Button("放弃训练", role: .destructive) {
                        store.discardWorkout()
                        dismiss()
                    }
                }
            }
        }
        .navigationTitle("训练中")
    }
}

private struct WatchExerciseView: View {
    @EnvironmentObject private var store: TrainingStore
    let exerciseId: String
    @State private var restUntil: Date?
    @State private var timerLabel = "休息"

    var body: some View {
        let workout = store.activeWorkout
        let references = workout.map {
            TrainingComparison(workouts: store.state.workouts).previousExerciseSets(for: $0, exerciseId: exerciseId)[exerciseId] ?? []
        } ?? []
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(store.exercise(exerciseId)?.name ?? "未知动作")
                    .font(.headline).lineLimit(2)
                if let exercise = store.exercise(exerciseId), ExerciseDemo.find(exercise) != nil {
                    NavigationLink("查看动图", destination: ExerciseDemoView(exercise: exercise))
                }
                ForEach(references) { reference in
                    PreviousExerciseSetsView(reference: reference)
                }
                if let restUntil {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let remaining = max(0, Int(restUntil.timeIntervalSince(context.date)))
                        Text(remaining > 0 ? "\(timerLabel) \(remaining) 秒" : "计时结束，请按实际情况记录")
                            .font(.caption.bold())
                        .foregroundStyle(lime)
                    }
                    Button("停止计时") { self.restUntil = nil }
                }
                ForEach(workout?.sets.filter { $0.exerciseId == exerciseId } ?? []) { set in
                    VStack(alignment: .leading, spacing: 7) {
                        Text("第 \(set.setNumber) 组").font(.caption.bold()).foregroundStyle(lime)
                        if BreathingProfile.find(store.exercise(exerciseId)) == nil {
                            Stepper(value: Binding(get: { set.weight }, set: { store.updateSet(set.id, weight: $0) }), in: 0...2000, step: 2.5) {
                                Text("\(set.weight.formatted()) kg")
                            }
                        }
                        Stepper(value: Binding(get: { set.reps }, set: { store.updateSet(set.id, reps: $0) }), in: 0...1000) {
                            Text(set.targetLabel)
                        }
                        if let workout,
                           let reference = references.first(where: { $0.unit == (set.unit ?? .reps) }),
                           let source = reference.reusableSet(for: set, in: workout) {
                            ReusePreviousSetButton(workoutId: workout.id, setId: set.id, source: source)
                        }
                        if set.unit == .seconds && !set.completed {
                            if let profile = BreathingProfile.find(store.exercise(exerciseId)) {
                                NavigationLink("呼吸引导 \(set.reps) 秒") {
                                    ScrollView { BreathingGuideView(profile: profile, seconds: set.reps).padding(.horizontal, 4) }
                                        .navigationTitle("呼吸引导")
                                }
                            } else {
                                Button("计时 \(set.reps) 秒") { timerLabel = "动作计时"; restUntil = .now.addingTimeInterval(Double(set.reps)) }
                            }
                        }
                        Button {
                            store.updateSet(set.id, completed: !set.completed)
                            if !set.completed { timerLabel = "休息"; restUntil = .now.addingTimeInterval(Double(set.restSeconds ?? 90)) }
                        } label: {
                            Label(set.completed ? "已完成" : "完成这组", systemImage: set.completed ? "checkmark.circle.fill" : "circle")
                        }
                        .disabled(set.reps == 0)
                        .buttonStyle(.borderedProminent)
                    }
                    .padding(.vertical, 5)
                    Divider()
                }
                Button("添加一组", systemImage: "plus") {
                    store.addSet(for: exerciseId)
                }
            }
        }
        .navigationTitle("动作")
    }
}

private struct WatchExercisePicker: View {
    @EnvironmentObject private var store: TrainingStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List(store.state.exercises) { exercise in
            Button {
                store.addWorkoutExercise(exercise.id)
                dismiss()
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(exercise.name)
                    Text(exercise.muscle).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("选择动作")
    }
}

private struct WatchProgressView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var weekOffset = 0

    var body: some View {
        let progress = TrainingProgress(workouts: store.state.workouts)
        let today = Date.now
        let currentWeek = progress.week(containing: today)
        let date = progress.calendar.date(byAdding: .weekOfYear, value: weekOffset, to: today) ?? today
        let week = weekOffset == 0 ? currentWeek : progress.week(containing: date)
        let days = week.days
        let exercises = progress.exerciseOptions(store.state.exercises)

        List {
            Section("每周目标") {
                WeeklyGoalControl(activeDays: currentWeek.activeDays(through: today))
            }
            Section("训练日历") {
                VStack(alignment: .leading, spacing: 7) {
                    if let first = days.first, let last = days.last {
                        Text("\(first.date.formatted(.dateTime.month().day())) – \(last.date.formatted(.dateTime.month().day()))")
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 2) {
                        ForEach(days) { day in
                            VStack(spacing: 4) {
                                Text(day.date.formatted(.dateTime.day()))
                                    .font(.caption2.monospacedDigit())
                                    .lineLimit(1).minimumScaleFactor(0.65)
                                Circle()
                                    .fill(day.completedSets > 0 ? lime : .secondary.opacity(0.45))
                                    .frame(width: 6, height: 6)
                            }
                            .frame(maxWidth: .infinity)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(day.date.formatted(date: .abbreviated, time: .omitted))，\(day.completedSets) 组")
                        }
                    }
                    Text("\(week.activeDays()) 天 · \(week.completedSets) 组")
                        .font(.caption.bold()).foregroundStyle(lime)
                }
                Button(weekOffset == 0 ? "查看上周" : "返回本周") {
                    weekOffset = weekOffset == 0 ? -1 : 0
                }
            }
            Section("动作进度") {
                if exercises.isEmpty {
                    Text("保存已完成的训练组后查看个人纪录。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(exercises) { exercise in
                    NavigationLink {
                        WatchExerciseProgressView(exercise: exercise)
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(exercise.name)
                            if exercise.isCustom {
                                Text("自定义").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("训练进度")
    }
}

private struct WatchExerciseProgressView: View {
    @EnvironmentObject private var store: TrainingStore
    let exercise: Exercise

    var body: some View {
        let progress = TrainingProgress(workouts: store.state.workouts).exercise(exercise.id)
        List {
            Section("个人纪录") {
                if progress.records.metrics.isEmpty {
                    Text("暂无可比较的次数或时长。").font(.caption).foregroundStyle(.secondary)
                }
                ForEach(progress.records.metrics) { metric in
                    if let label = progress.records.label(metric) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(metric.rawValue).font(.caption2).foregroundStyle(.secondary)
                            Text(label).font(.subheadline.bold()).foregroundStyle(lime)
                        }
                    }
                }
            }
            Section("最近训练") {
                ForEach(progress.recent) { session in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(session.date.formatted(date: .abbreviated, time: .shortened))
                            .font(.caption2).foregroundStyle(.secondary)
                        ForEach(session.records.metrics) { metric in
                            if let label = session.records.label(metric) {
                                Text(label).font(.caption)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(exercise.name)
    }
}

private struct WatchBackupView: View {
    var body: some View {
        ScrollView {
            TrainingBackupActions()
                .padding(.vertical, 4)
        }
        .navigationTitle("数据备份")
    }
}

private struct WatchWellnessView: View {
    @EnvironmentObject private var store: TrainingStore

    var body: some View {
        let trend = WellnessTrend.bodyTrend(store.state.bodyEntries)
        let today = ScheduledTraining.localDay(.now)
        let todayCalories = WellnessTrend.nutritionTrend(store.state.foodEntries).first { $0.day == today }?.calories
        List {
            Section("最近体重") {
                if let latest = trend.latest {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(latest.weight.formatted()) kg")
                            .font(.headline).foregroundStyle(lime)
                        if let delta = trend.weightDelta {
                            Text(weightChange(delta))
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        Text(latest.recordedAt.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption2).foregroundStyle(.secondary)
                    }
                } else {
                    Text("还没有体重记录。").font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("今日热量") {
                Text("\((todayCalories ?? 0).formatted()) 千卡")
                    .font(.headline).foregroundStyle(lime)
                if todayCalories == nil {
                    Text("今天还没有饮食记录。").font(.caption2).foregroundStyle(.secondary)
                }
            }
            if !trend.points.isEmpty {
                Section("近期体重") {
                    ForEach(Array(trend.points.suffix(8).reversed())) { point in
                        HStack {
                            Text(point.recordedAt.formatted(date: .abbreviated, time: .omitted))
                                .font(.caption2)
                            Spacer()
                            Text("\(point.weight.formatted()) kg")
                                .font(.caption).foregroundStyle(lime)
                        }
                    }
                }
            }
        }
        .navigationTitle("身体饮食")
    }

    private func weightChange(_ delta: Double) -> String {
        if delta == 0 { return "与上次相同" }
        if delta > 0 { return "+\(delta.formatted()) kg" }
        return "−\(abs(delta).formatted()) kg"
    }
}

private struct WatchHistoryView: View {
    @EnvironmentObject private var store: TrainingStore
    var body: some View {
        let history = store.finishedWorkouts
        let comparison = TrainingComparison(workouts: history)
        List(history.prefix(20)) { workout in
            VStack(alignment: .leading, spacing: 4) {
                Text(workout.name).font(.subheadline.bold()).lineLimit(2)
                Text(workout.startedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption2).foregroundStyle(.secondary)
                Text("\(workout.completedSets.count) 组 · \(Int(workout.volume)) kg")
                    .font(.caption2).foregroundStyle(lime)
                if let prior = comparison.previousPlanWorkout(for: workout) {
                    PlanWorkoutComparisonView(comparison: prior)
                }
                SaveWorkoutPlanButton(workout: workout)
            }
        }
        .navigationTitle("历史")
    }
}

private struct WatchDemoLibrary: View {
    @EnvironmentObject private var store: TrainingStore
    var body: some View {
        List(store.state.exercises.filter { ExerciseDemo.find($0) != nil }) { exercise in
            NavigationLink(destination: ExerciseDemoView(exercise: exercise)) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(exercise.name)
                    Text(exercise.muscle).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("动作动图")
    }
}
