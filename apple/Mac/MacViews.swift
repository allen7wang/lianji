import SwiftUI
import Charts

private enum Section: String, CaseIterable, Identifiable {
    case today = "今天"
    case plans = "训练计划"
    case schedule = "训练安排"
    case exercises = "动作库"
    case progress = "训练进度"
    case history = "训练历史"
    case backup = "数据备份"
    case nutrition = "饮食记录"
    case body = "身体数据"
    case settings = "设置"

    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .today: "house.fill"
        case .plans: "calendar"
        case .schedule: "calendar.badge.clock"
        case .exercises: "dumbbell.fill"
        case .progress: "chart.bar.fill"
        case .history: "clock.arrow.circlepath"
        case .backup: "externaldrive.fill"
        case .nutrition: "fork.knife"
        case .body: "figure.strengthtraining.traditional"
        case .settings: "gearshape"
        }
    }
}

struct MacRootView: View {
    @State private var selected: Section? = .today

    var body: some View {
        NavigationSplitView {
            List(Section.allCases, selection: $selected) { section in
                Label(section.rawValue, systemImage: section.symbol)
                    .tag(section)
                    .padding(.vertical, 6)
            }
            .navigationTitle("练迹")
            .frame(minWidth: 190)
        } detail: {
            Group {
                switch selected ?? .today {
                case .today: MacDashboard()
                case .plans: MacPlansView()
                case .schedule: MacScheduleView()
                case .exercises: MacExercisesView()
                case .progress: MacProgressView()
                case .history: MacHistoryView()
                case .backup: MacBackupView()
                case .nutrition: MacNutritionView()
                case .body: MacBodyView()
                case .settings:
                    VStack(alignment: .leading, spacing: Theme.Spacing.xl) {
                        Text("设置").themeText(.title1)
                        Surface { TrainingPreferencesView() }
                        Spacer()
                    }
                    .padding(Theme.Spacing.xxl)
                    .frame(maxWidth: 720, alignment: .leading)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bg)
        }
        .tint(Theme.Colors.accentText)
    }
}

private struct Surface<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .themeCard()
    }
}

private struct PageHeader: View {
    let eyebrow: String
    let title: String
    var body: some View {
        ThemePageHeader(overline: eyebrow, title: title)
    }
}

private struct Stat: View {
    let value: String
    let label: String
    var body: some View {
        ThemeStat(value: value, caption: label, tint: Theme.Colors.data)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct MacDashboard: View {
    @EnvironmentObject private var store: TrainingStore
    private var recent: [Workout] { store.finishedWorkouts }
    private var week: [Workout] {
        let start = Calendar.current.dateInterval(of: .weekOfYear, for: .now)?.start ?? .now
        return recent.filter { $0.startedAt >= start }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageHeader(eyebrow: "LIANJI · TRAINING LOG", title: "今天练什么？")
                SignalCard {
                    HStack(spacing: 30) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(store.activeWorkout == nil ? "自由训练" : "正在训练")
                                .font(.system(size: 25, weight: .bold))
                            if let workout = store.activeWorkout { Text(workout.name) }
                            if store.activeWorkout == nil {
                                Button("开始自由训练") { store.startWorkout(planId: nil) }
                                    .buttonStyle(.themeSecondary(.small))
                            }
                        }
                        Spacer()
                        Image(systemName: "dumbbell.fill").font(.system(size: 58)).foregroundStyle(Theme.Colors.onAccent)
                    }
                }
                HStack(spacing: 14) {
                    Surface { Stat(value: "\(week.count)", label: "本周训练次数") }
                    Surface { Stat(value: "\(week.reduce(0) { $0 + $1.completedSets.count })", label: "本周完成组数") }
                    Surface { Stat(value: "\(store.state.preferences.weightUnit.format(kilograms: week.reduce(0) { $0 + $1.volume }))", label: "本周训练容量") }
                }
                if store.activeWorkout != nil { MacActiveWorkout() }
                Text("训练计划").font(.title2.bold())
                ForEach(store.orderedPlans) { plan in
                    Surface {
                        HStack {
                            VStack(alignment: .leading, spacing: 5) {
                                Label(plan.name, systemImage: store.isPlanFavorite(plan.id) ? "star.fill" : "dumbbell")
                                    .font(.headline)
                                Text("\(plan.items.count) 个动作 · \(plan.note)").font(.caption).foregroundStyle(Theme.Colors.textMuted)
                            }
                            Spacer()
                            Button("开始训练") { store.startWorkout(planId: plan.id) }
                                .disabled(store.activeWorkout != nil)
                        }
                    }
                }
            }
            .padding(30)
            .frame(maxWidth: 1000, alignment: .leading)
        }
    }
}

private struct MacScheduleView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var date = Date.now
    @State private var planId = ""
    @State private var saveFailed = false

    var body: some View {
        let now = Date.now
        let today = Calendar.current.startOfDay(for: now)
        let items = store.trainingSchedule(now: now)
        let selectedPlan = store.state.plans.first { $0.id == planId }
        let scheduledDay = ScheduledTraining.localDay(date)
        let duplicate = items.contains { $0.entry.day == scheduledDay && $0.entry.planId == planId }

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                PageHeader(eyebrow: "TRAINING SCHEDULE", title: "训练安排")
                if store.activeWorkout != nil { MacActiveWorkout() }
                Surface {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("添加安排").font(.title2.bold())
                        if store.state.plans.isEmpty {
                            Text("先在「训练计划」里新建或添加一份计划。").foregroundStyle(Theme.Colors.textMuted)
                        } else {
                            HStack {
                                DatePicker("日期", selection: $date, in: today..., displayedComponents: .date)
                                Picker("计划", selection: Binding(
                                    get: { selectedPlan?.id ?? "" },
                                    set: { planId = $0 }
                                )) {
                                    Text("选择计划").tag("")
                                    ForEach(store.orderedPlans) { plan in
                                        Text(store.isPlanFavorite(plan.id) ? "★ \(plan.name)" : plan.name).tag(plan.id)
                                    }
                                }
                                .frame(maxWidth: 260)
                                Button(duplicate ? "已安排" : "添加安排", systemImage: "plus") {
                                    do { try store.scheduleTraining(planId: planId, on: date) }
                                    catch { saveFailed = true }
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(selectedPlan == nil || duplicate || date < today)
                            }
                        }
                    }
                }
                if items.isEmpty {
                    Text("还没有训练安排。").foregroundStyle(Theme.Colors.textMuted)
                }
                ForEach(items) { item in
                    Surface {
                        HStack {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.plan.name).font(.headline)
                                Text("\(item.entry.day) · \(item.status.rawValue)")
                                    .font(.subheadline)
                                    .foregroundStyle(item.status == .missed ? Theme.Colors.textMuted : Theme.Colors.data)
                            }
                            Spacer()
                            TrainingScheduleActions(item: item)
                        }
                    }
                }
            }
            .padding(30)
            .frame(maxWidth: 1000, alignment: .leading)
        }
        .alert("无法添加训练安排", isPresented: $saveFailed) {
            Button("好", role: .cancel) {}
        } message: {
            Text("请选择今天或之后的日期和可用计划，然后重试。")
        }
    }
}

private struct MacPlansView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var editing: Plan?
    @State private var adding = false
    @State private var showTemplates = false
    @State private var category = "全部"
    @State private var sport = "全部项目"
    @State private var program: TrainingProgram?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    PageHeader(eyebrow: "YOUR PROGRAMS", title: "训练计划")
                    Spacer()
                    Button("新建计划", systemImage: "plus") { adding = true }
                }
                Picker("计划来源", selection: $showTemplates) {
                    Text("我的计划").tag(false)
                    Text("计划模板 · \(TrainingProgram.catalog.count) 套").tag(true)
                }.pickerStyle(.segmented).frame(width: 320)
                if showTemplates {
                    Picker("训练场景", selection: $category) {
                        ForEach(TrainingProgram.categories, id: \.self) { Text($0).tag($0) }
                    }.frame(maxWidth: 360).onChange(of: category) { sport = "全部项目" }
                    if category == "专项力量" {
                        Picker("运动项目", selection: $sport) {
                            ForEach(TrainingProgram.sports, id: \.self) { Text($0).tag($0) }
                        }.frame(maxWidth: 360)
                    }
                    ForEach(TrainingProgram.catalog.filter { (category == "全部" || $0.category == category) && (category != "专项力量" || sport == "全部项目" || $0.sport == sport) }) { template in
                        Surface {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("\(template.name) · \(template.subtitle)").font(.title3.bold())
                                Text(template.description).foregroundStyle(Theme.Colors.textMuted)
                                Text("\(template.level) · \(template.equipment.joined(separator: " / "))").font(.caption).foregroundStyle(Theme.Colors.textMuted)
                                Text(template.frequency).font(.caption)
                                Text("一轮 \(template.days.count) 个训练日 · \(template.days.map(\.name).joined(separator: " / "))").font(.caption)
                                Button("查看模板") { program = template }
                            }
                        }
                    }
                } else { ForEach(store.orderedPlans) { plan in
                    Surface {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(plan.name).font(.title3.bold())
                                    Text(plan.note).font(.caption).foregroundStyle(Theme.Colors.textMuted)
                                }
                                Spacer()
                                PlanFavoriteButton(plan: plan)
                            }
                            HStack {
                                Button("编辑") { editing = plan }
                                DuplicatePlanButton(plan: plan)
                                Button("开始训练") { store.startWorkout(planId: plan.id) }
                                    .disabled(store.activeWorkout != nil)
                            }
                            Divider()
                            ForEach(plan.items) { item in
                                HStack {
                                    Text(store.exercise(item.exerciseId)?.name ?? "未知动作")
                                    Spacer()
                                    Text("\(item.sets) × \(item.targetLabel) · \(store.state.preferences.weightUnit.format(kilograms: item.weight))")
                                        .foregroundStyle(Theme.Colors.textMuted)
                                }.font(.subheadline)
                            }
                        }
                    }
                } }
                if store.activeWorkout != nil { MacActiveWorkout() }
            }
            .padding(30)
            .frame(maxWidth: 1000)
        }
        .sheet(item: $editing) { MacPlanEditor(plan: $0) }
        .sheet(isPresented: $adding) { MacPlanEditor(plan: nil) }
        .sheet(item: $program) { template in MacProgramPreview(program: template) { showTemplates = false } }
    }
}

private struct MacProgramPreview: View {
    @EnvironmentObject private var store: TrainingStore
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?
    let program: TrainingProgram
    var onAdded: () -> Void
    private var missing: Int { program.missingDays(in: store.state.plans) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("\(program.name) · \(program.subtitle)").font(.title2.bold())
                Spacer()
                Button("关闭") { dismiss() }
            }
            Text(program.description).foregroundStyle(.secondary)
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("\(program.category) · \(program.level) · \(program.equipment.joined(separator: " / "))").font(.caption)
                    Text(program.frequency).font(.subheadline)
                    ForEach(program.guidance, id: \.self) { Text("• \($0)").font(.caption).foregroundStyle(.secondary) }
                    ForEach(Array(program.days.enumerated()), id: \.element.id) { index, day in
                        GroupBox("\(index + 1) · \(day.name)") {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(day.focus).font(.caption).foregroundStyle(.secondary)
                                ForEach(day.exercises, id: \.name) { item in
                                    HStack { Text(item.name); Spacer(); Text("\(item.sets) 组 × \(item.targetLabel) · 休息 \(item.restSeconds ?? 90) 秒").foregroundStyle(.secondary) }
                                }
                            }.padding(8)
                        }
                    }
                }
            }
            Text(program.category == "呼吸训练" ? "呼吸练习按秒记录。添加后可调整秒数，重复添加会保留修改。" : "训练日之间可安排休息。添加后可编辑；目标重量初始为 0 kg，请按实际填写。").font(.caption).foregroundStyle(.secondary)
            if let error { Text(error).foregroundStyle(.red) }
            Button(missing == 0 ? "已添加到我的计划" : "添加到我的计划 · \(missing) 个训练日") {
                do { try store.importTemplate(program); onAdded(); dismiss() }
                catch { self.error = error.localizedDescription }
            }.buttonStyle(.borderedProminent).disabled(missing == 0)
        }.padding(24).frame(width: 650, height: 620)
    }
}

private struct MacPlanEditor: View {
    @EnvironmentObject private var store: TrainingStore
    @Environment(\.dismiss) private var dismiss
    @State private var draft: Plan
    @State private var selectedExercise = ""

    init(plan: Plan?) {
        _draft = State(initialValue: plan ?? Plan(name: "", items: []))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(draft.name.isEmpty ? "新建计划" : "编辑计划").font(.title2.bold())
            TextField("计划名称", text: $draft.name)
            TextField("说明", text: $draft.note)
            HStack {
                Picker("添加动作", selection: $selectedExercise) {
                    Text("选择动作").tag("")
                    ForEach(store.state.exercises) { exercise in
                        Text(exercise.name).tag(exercise.id)
                    }
                }
                Button("添加") {
                    guard !selectedExercise.isEmpty, !draft.items.contains(where: { $0.exerciseId == selectedExercise }) else { return }
                    let unit = store.exercise(selectedExercise)?.defaultUnit ?? .reps
                    draft.items.append(PlanItem(exerciseId: selectedExercise, sets: 3, reps: unit == .seconds ? 30 : 10, weight: 0, unit: unit, restSeconds: 90))
                    selectedExercise = ""
                }
            }
            List {
                ForEach($draft.items) { $item in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(store.exercise(item.exerciseId)?.name ?? "未知动作").font(.headline)
                            Spacer()
                            Button("上移", systemImage: "arrow.up") { moveDraftItem(item.id, direction: -1) }
                                .disabled(draft.items.first?.id == item.id)
                                .accessibilityLabel("上移\(store.exercise(item.exerciseId)?.name ?? "当前动作")")
                            Button("下移", systemImage: "arrow.down") { moveDraftItem(item.id, direction: 1) }
                                .disabled(draft.items.last?.id == item.id)
                                .accessibilityLabel("下移\(store.exercise(item.exerciseId)?.name ?? "当前动作")")
                        }
                        HStack(spacing: 8) {
                        Stepper("\(item.sets) 组", value: $item.sets, in: 1...20).frame(width: 110)
                        Picker("记录", selection: Binding(get: { item.unit ?? .reps }, set: { item.unit = $0 })) {
                            Text("次").tag(TrainingUnit.reps)
                            Text("秒").tag(TrainingUnit.seconds)
                        }.frame(width: 90)
                        Stepper(item.targetLabel, value: $item.reps, in: 1...1000).frame(width: 110)
                        Stepper("休息 \(item.restSeconds ?? 90) 秒", value: Binding(get: { item.restSeconds ?? 90 }, set: { item.restSeconds = $0 }), in: 0...600, step: 5).frame(width: 160)
                        if BreathingProfile.find(store.exercise(item.exerciseId)) == nil { WeightField(kilograms: item.weight, unit: store.state.preferences.weightUnit) { item.weight = $0 }.frame(width: 90) }
                        Button(role: .destructive) { draft.items.removeAll { $0.id == item.id } } label: {
                            Image(systemName: "trash")
                        }
                        }
                    }
                }
            }
            HStack {
                Spacer()
                Button("取消") { dismiss() }
                Button("保存") { store.savePlan(draft); dismiss() }
                    .buttonStyle(.borderedProminent)
                    .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty || draft.items.isEmpty)
            }
        }
        .padding(24)
        .frame(width: 660, height: 520)
    }

    private func moveDraftItem(_ id: String, direction: Int) {
        guard let index = draft.items.firstIndex(where: { $0.id == id }),
              draft.items.indices.contains(index + direction) else { return }
        draft.items.swapAt(index, index + direction)
    }
}

private struct MacExercisesView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var query = ""
    @State private var name = ""
    @State private var muscle = "胸"
    @State private var equipment = ""
    @State private var adding = false
    @State private var demoExercise: Exercise?
    private let muscles = ["胸", "背", "腿", "肩", "手臂", "核心", "全身"]

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                PageHeader(eyebrow: "EXERCISE LIBRARY", title: "动作库")
                Spacer()
                Button("新增动作", systemImage: "plus") { adding = true }
            }
            TextField("搜索动作或器械", text: $query)
                .textFieldStyle(.roundedBorder)
            List(store.state.exercises.filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) || $0.equipment.localizedCaseInsensitiveContains(query) }) { exercise in
                HStack {
                    Image(systemName: "dumbbell.fill").foregroundStyle(Theme.Colors.data).frame(width: 30)
                    Text(exercise.name)
                    Spacer()
                    Text("\(exercise.muscle) · \(exercise.equipment)").foregroundStyle(Theme.Colors.textMuted)
                    if ExerciseDemo.find(exercise) != nil {
                        Button("查看动图", systemImage: "play.circle") { demoExercise = exercise }
                    }
                }
                .padding(.vertical, 5)
            }
        }
        .padding(30)
        .frame(maxWidth: 1000)
        .sheet(item: $demoExercise) { MacExerciseDemoSheet(exercise: $0) }
        .sheet(isPresented: $adding) {
            VStack(alignment: .leading, spacing: 16) {
                Text("新增动作").font(.title2.bold())
                TextField("动作名称", text: $name)
                Picker("训练部位", selection: $muscle) { ForEach(muscles, id: \.self) { Text($0) } }
                TextField("器械", text: $equipment)
                HStack {
                    Spacer()
                    Button("取消") { adding = false }
                    Button("保存") {
                        store.addExercise(name: name.trimmingCharacters(in: .whitespaces), muscle: muscle, equipment: equipment.isEmpty ? "自定义" : equipment)
                        name = ""; equipment = ""; adding = false
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(24)
            .frame(width: 420)
        }
    }
}

private struct MacActiveWorkout: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var selectedExercise = ""
    @State private var restUntil: Date?
    @State private var timerExerciseId: String?
    @State private var timerLabel = "组间休息"
    @State private var demoExercise: Exercise?
    @State private var breathGuide: BreathGuideRequest?

    var body: some View {
        if let workout = store.activeWorkout {
            let references = TrainingComparison(workouts: store.state.workouts).previousExerciseSets(for: workout)
            Surface {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("正在训练 · \(workout.name)").font(.title3.bold())
                            Text("已完成 \(workout.completedSets.count) / \(workout.sets.count) 组 · 容量 \(store.state.preferences.weightUnit.format(kilograms: workout.volume))")
                                .foregroundStyle(Theme.Colors.textMuted)
                        }
                        Spacer()
                        Button("放弃", role: .destructive) { store.discardWorkout() }
                        Button("结束训练") { store.finishWorkout() }
                            .buttonStyle(.borderedProminent)
                            .disabled(workout.completedSets.isEmpty)
                    }
                    if let restUntil {
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            let remaining = max(0, Int(restUntil.timeIntervalSince(context.date)))
                            Text(remaining > 0 ? "\(timerLabel) · \(remaining) 秒" : "计时结束，请按实际完成情况记录")
                                .font(.subheadline.bold())
                                .foregroundStyle(Theme.Colors.data)
                        }
                        Button("停止计时") { self.restUntil = nil; timerExerciseId = nil }
                    }
                    ForEach(workout.exerciseIds, id: \.self) { exerciseId in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(store.exercise(exerciseId)?.name ?? "未知动作").font(.headline)
                                Spacer()
                                if let exercise = store.exercise(exerciseId), ExerciseDemo.find(exercise) != nil {
                                    Button("查看动图", systemImage: "play.circle") { demoExercise = exercise }
                                }
                            }
                            WorkoutExerciseOrderControls(workoutId: workout.id, exerciseId: exerciseId, orderedExerciseIds: workout.exerciseIds)
                            ReplaceWorkoutExerciseButton(workoutId: workout.id, exerciseId: exerciseId) { _ in
                                if timerExerciseId == exerciseId {
                                    restUntil = nil
                                    timerExerciseId = nil
                                }
                            }
                            ForEach(references[exerciseId, default: []]) { reference in
                                PreviousExerciseSetsView(reference: reference)
                            }
                            TrainingSuggestionRow(exerciseId: exerciseId)
                            ForEach(workout.sets.filter { $0.exerciseId == exerciseId }) { set in
                                setRow(set, workout: workout, references: references[exerciseId, default: []])
                            }
                            HStack {
                                Button("添加一组", systemImage: "plus") { store.addSet(for: exerciseId) }
                                Button("添加热身组") { store.addWarmupSet(for: exerciseId) }
                            }
                            .font(.caption)
                        }
                        Divider()
                    }
                    HStack {
                        Picker("添加动作", selection: $selectedExercise) {
                            Text("选择动作").tag("")
                            ForEach(store.state.exercises) { exercise in Text(exercise.name).tag(exercise.id) }
                        }
                        Button("添加") { store.addWorkoutExercise(selectedExercise); selectedExercise = "" }
                            .disabled(selectedExercise.isEmpty)
                    }
                    TextField("训练笔记", text: Binding(get: { workout.note }, set: { store.updateNote($0) }))
                }
            }
            .sheet(item: $demoExercise) { MacExerciseDemoSheet(exercise: $0) }
            .sheet(item: $breathGuide) { MacBreathingGuideSheet(request: $0) }
        }
    }

    private func setRow(_ set: TrainingSet, workout: Workout, references: [PreviousExerciseSets]) -> some View {
        let exerciseId = set.exerciseId
        return VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 12) {
                ThemeTag(text: set.isWarmup ? "W · 热身" : "第 \(workout.workingSetOrdinal(of: set.id) ?? set.setNumber) 组", tone: set.isWarmup ? .warning : .neutral)
                    .frame(width: 72, alignment: .leading)
                if BreathingProfile.find(store.exercise(exerciseId)) == nil {
                    WeightField(kilograms: set.weight, unit: store.state.preferences.weightUnit) {
                        store.updateSet(set.id, weight: $0)
                    }.frame(width: 90)
                }
                TextField(set.unit == .seconds ? "秒数" : "次数", value: Binding(get: { set.reps }, set: { store.updateSet(set.id, reps: $0) }), format: .number)
                    .frame(width: 70)
                Text(set.unit == .seconds ? "秒" : "次")
                if set.unit == .seconds && !set.completed {
                    Button(BreathingProfile.find(store.exercise(exerciseId)) == nil ? "计时" : "呼吸引导") {
                        guard store.activeWorkout?.sets.contains(where: { $0.id == set.id }) == true else { return }
                        if let profile = BreathingProfile.find(store.exercise(exerciseId)) {
                            restUntil = nil; timerExerciseId = nil; breathGuide = BreathGuideRequest(profile: profile, seconds: set.reps)
                        } else {
                            timerLabel = "动作计时"; timerExerciseId = exerciseId
                            restUntil = .now.addingTimeInterval(Double(set.reps))
                        }
                    }
                }
                Toggle("完成", isOn: Binding(get: { set.completed }, set: {
                    store.updateSet(set.id, completed: $0)
                    if $0, store.activeWorkout?.sets.contains(where: { $0.id == set.id && $0.completed }) == true {
                        timerLabel = "组间休息"; timerExerciseId = exerciseId
                        restUntil = .now.addingTimeInterval(Double(set.restSeconds ?? 90))
                    }
                }))
                    .toggleStyle(.checkbox)
                Button(role: .destructive) { store.deleteSet(set.id) } label: { Image(systemName: "minus.circle") }
                    .buttonStyle(.plain)
            }
            SetKindAndRPE(set: set)
            if let reference = references.first(where: { $0.unit == (set.unit ?? .reps) }),
               let source = reference.reusableSet(for: set, in: workout) {
                ReusePreviousSetButton(workoutId: workout.id, setId: set.id, source: source)
            }
        }
        .themeCard(padding: Theme.Spacing.sm)
    }
}

private struct MacProgressView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var weekOffset = 0
    @State private var selectedDate: Date?
    @State private var exerciseId: String?
    @State private var metric: ProgressMetric = .weight

    var body: some View {
        let progress = TrainingProgress(workouts: store.state.workouts)
        let today = Date.now
        let weeks = progress.recentWeeks(through: today)
        let currentWeek = weeks.last ?? progress.week(containing: today)
        let weekDate = progress.calendar.date(byAdding: .weekOfYear, value: weekOffset, to: today) ?? today
        let week = weekOffset == 0 ? currentWeek : progress.week(containing: weekDate)
        let exercises = progress.exerciseOptions(store.state.exercises)
        let activeExerciseId = exercises.first { $0.id == exerciseId }?.id ?? exercises.first?.id

        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageHeader(eyebrow: "YOUR PROGRESS", title: "训练进度")
                weeklyGoal(currentWeek, recentWeeks: weeks, through: today)
                weeklyActivity(week)
                Surface {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("动作进度").font(.title2.bold())
                        if let activeExerciseId {
                            Picker("动作", selection: Binding(
                                get: { activeExerciseId },
                                set: { exerciseId = $0 }
                            )) {
                                ForEach(exercises) { exercise in
                                    Text(exercise.isCustom ? "\(exercise.name)（自定义）" : exercise.name).tag(exercise.id)
                                }
                            }
                            exerciseProgress(progress.exercise(activeExerciseId))
                        } else {
                            Text("保存包含已完成组的训练后，可在这里查看个人纪录。")
                                .foregroundStyle(Theme.Colors.textMuted)
                        }
                    }
                }
            }
            .padding(30)
            .frame(maxWidth: 1000, alignment: .leading)
        }
    }

    private func weeklyGoal(_ week: TrainingWeek, recentWeeks: [TrainingWeek], through today: Date) -> some View {
        Surface {
            VStack(alignment: .leading, spacing: 14) {
                Text("每周训练目标").font(.title2.bold())
                WeeklyGoalControl(activeDays: week.activeDays(through: today))
                Divider()
                Text("最近四周训练天数").font(.headline)
                HStack(spacing: 12) {
                    ForEach(recentWeeks) { activity in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(activity.id == week.id ? "本周" : "\(activity.start.formatted(.dateTime.month().day()))起")
                                .font(.caption).foregroundStyle(Theme.Colors.textMuted)
                            Text("\(activity.activeDays(through: today)) 天")
                                .font(.title3.bold().monospacedDigit()).foregroundStyle(Theme.Colors.data)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Theme.Colors.data.opacity(0.05), in: RoundedRectangle(cornerRadius: 8))
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    private func weeklyActivity(_ week: TrainingWeek) -> some View {
        let days = week.days
        let selectedDay = days.first { $0.date == selectedDate }
            ?? days.first { Calendar.current.isDateInToday($0.date) }
            ?? days.first { $0.completedSets > 0 }
            ?? days.first
        return Surface {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("训练日历").font(.title2.bold())
                    Spacer()
                    if let first = days.first, let last = days.last {
                        Text("\(first.date.formatted(.dateTime.year().month().day())) – \(last.date.formatted(.dateTime.month().day()))")
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                    Button {
                        weekOffset -= 1
                        selectedDate = nil
                    } label: {
                        Image(systemName: "chevron.left")
                    }.accessibilityLabel("上一周")
                    Button {
                        weekOffset += 1
                        selectedDate = nil
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                    .disabled(weekOffset == 0)
                    .accessibilityLabel("下一周")
                    Button("本周") {
                        weekOffset = 0
                        selectedDate = nil
                    }.disabled(weekOffset == 0)
                }
                HStack(spacing: 8) {
                    ForEach(days) { day in
                        let isSelected = day.id == selectedDay?.id
                        Button {
                            selectedDate = day.date
                        } label: {
                            VStack(spacing: 4) {
                                Text(day.date.formatted(.dateTime.weekday(.abbreviated))).font(.caption)
                                Text(day.date.formatted(.dateTime.day())).font(.headline)
                                Text("\(day.completedSets) 组").font(.caption)
                                    .foregroundStyle(day.completedSets > 0 ? Theme.Colors.data : Theme.Colors.textMuted)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9)
                            .background(Theme.Colors.data.opacity(isSelected ? 0.18 : 0.04), in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(day.date.formatted(date: .complete, time: .omitted))，\(day.completedSets) 组")
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                    }
                }
                Text("\(week.activeDays()) 个训练日 · \(week.completedSets) 个完成组")
                    .font(.subheadline).foregroundStyle(Theme.Colors.data)
                if let selectedDay {
                    Divider()
                    Text(selectedDay.date.formatted(.dateTime.month().day().weekday())).font(.headline)
                    if selectedDay.workouts.isEmpty {
                        Text("当天没有保存的训练").foregroundStyle(Theme.Colors.textMuted)
                    }
                    ForEach(selectedDay.workouts) { workout in
                        HStack {
                            Text(workout.name)
                            Spacer()
                            Text("\(workout.startedAt.formatted(date: .omitted, time: .shortened)) · \(workout.completedSets.count) 组")
                                .foregroundStyle(Theme.Colors.textMuted)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func exerciseProgress(_ progress: ExerciseProgress) -> some View {
        let metrics = progress.records.metrics
        if metrics.isEmpty {
            Text("此动作还没有可比较的次数或时长。").foregroundStyle(Theme.Colors.textMuted)
        } else {
            Text("个人纪录").font(.headline)
            HStack(spacing: 20) {
                ForEach(metrics) { kind in
                    if let label = progress.records.label(kind, unit: store.state.preferences.weightUnit) {
                        Stat(value: label, label: kind.rawValue)
                    }
                }
            }
            if let activeMetric = metrics.contains(metric) ? metric : metrics.first {
                let samples = Array(progress.recentByMetric[activeMetric, default: []].reversed())
                Divider()
                Text("最近 \(samples.count) 次训练").font(.headline)
                Picker("趋势指标", selection: Binding(get: { activeMetric }, set: { metric = $0 })) {
                    ForEach(metrics) { kind in Text(kind.rawValue).tag(kind) }
                }
                .pickerStyle(.segmented)
                Chart(samples) { session in
                    if let value = session.records.value(activeMetric) {
                        BarMark(
                            x: .value("训练日期", session.date),
                            y: .value(activeMetric.rawValue, activeMetric.isWeight ? store.state.preferences.weightUnit.fromKilograms(value) : value)
                        )
                        .foregroundStyle(Theme.Colors.data)
                        .accessibilityLabel(session.date.formatted(date: .abbreviated, time: .omitted))
                        .accessibilityValue(session.records.label(activeMetric, unit: store.state.preferences.weightUnit) ?? "")
                    }
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month().day())
                    }
                }
                .chartYAxisLabel(activeMetric.unit(store.state.preferences.weightUnit))
                .frame(height: 150)
                ForEach(samples.reversed()) { session in
                    HStack {
                        Text(session.date.formatted(date: .abbreviated, time: .shortened)).foregroundStyle(Theme.Colors.textMuted)
                        Spacer()
                        Text(session.records.label(activeMetric, unit: store.state.preferences.weightUnit) ?? "")
                    }
                    .font(.subheadline)
                }
            }
        }
    }
}

private struct MacHistoryView: View {
    @EnvironmentObject private var store: TrainingStore
    var body: some View {
        let history = store.finishedWorkouts
        let comparison = TrainingComparison(workouts: history)
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                PageHeader(eyebrow: "YOUR PROGRESS", title: "训练历史")
                HStack(spacing: 14) {
                    Surface { Stat(value: "\(history.count)", label: "累计训练") }
                    Surface { Stat(value: "\(store.state.preferences.weightUnit.format(kilograms: history.reduce(0) { $0 + $1.volume }))", label: "累计容量") }
                }
                ForEach(history) { workout in
                    Surface {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(workout.name).font(.headline)
                                Spacer()
                                Text(workout.startedAt.formatted(date: .abbreviated, time: .shortened))
                                    .foregroundStyle(Theme.Colors.textMuted)
                                Button(role: .destructive) { store.deleteWorkout(workout.id) } label: { Image(systemName: "trash") }
                            }
                            Text("\(workout.completedSets.count) 组 · \(store.state.preferences.weightUnit.format(kilograms: workout.volume)) 容量")
                                .font(.subheadline).foregroundStyle(Theme.Colors.data)
                            if let prior = comparison.previousPlanWorkout(for: workout) {
                                PlanWorkoutComparisonView(comparison: prior)
                            }
                            ForEach(workout.completedSets) { set in
                                Text("\(set.isWarmup ? "W · " : "")\(store.exercise(set.exerciseId)?.name ?? "未知动作") · \(store.state.preferences.weightUnit.format(kilograms: set.weight)) × \(set.targetLabel)\(set.rpe.map { " · RPE \($0.formatted())" } ?? "")")
                                    .font(.caption).foregroundStyle(Theme.Colors.textMuted)
                            }
                            SaveWorkoutPlanButton(workout: workout)
                        }
                    }
                }
                if history.isEmpty { Text("还没有训练记录").foregroundStyle(Theme.Colors.textMuted) }
            }
            .padding(30).frame(maxWidth: 1000)
        }
    }
}

private struct MacNutritionView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var name = ""
    @State private var meal = "早餐"
    @State private var portion = "1 份"
    @State private var calories = 0.0
    @State private var protein = 0.0
    @State private var carbs = 0.0
    @State private var fat = 0.0
    @State private var editingGoals = false
    @State private var calorieGoal = 0
    @State private var proteinGoal = 0
    @State private var notice: String?
    @State private var frequent = false
    private var today: [FoodEntry] { store.state.foodEntries.filter { Calendar.current.isDateInToday($0.loggedAt) } }
    private var recentIntake: [NutritionDay] { WellnessTrend.nutritionTrend(store.state.foodEntries) }
    private var intakePeak: Double { recentIntake.map(\.calories).max() ?? 0 }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(eyebrow: "FOOD JOURNAL", title: "饮食记录")
                HStack(spacing: 14) {
                    Surface { Stat(value: "\(Int(today.reduce(0) { $0 + $1.calories }))", label: "今日千卡") }
                    Surface { Stat(value: "\(Int(today.reduce(0) { $0 + $1.protein })) g", label: "蛋白质") }
                    Surface { Stat(value: "\(Int(today.reduce(0) { $0 + $1.carbs })) g", label: "碳水") }
                    Surface { Stat(value: "\(Int(today.reduce(0) { $0 + $1.fat })) g", label: "脂肪") }
                }
                goalsCard
                quickFoodCard
                if !recentIntake.isEmpty {
                    Surface {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("近期摄入").font(.headline)
                            ForEach(recentIntake) { day in
                                HStack(spacing: 12) {
                                    Text(monthDayLabel(day.day))
                                        .font(.subheadline.monospacedDigit())
                                        .foregroundStyle(Theme.Colors.textMuted)
                                        .frame(width: 48, alignment: .leading)
                                    GeometryReader { proxy in
                                        let fraction = intakePeak > 0 ? day.calories / intakePeak : 0
                                        let width = proxy.size.width * CGFloat(fraction)
                                        ZStack(alignment: .leading) {
                                            RoundedRectangle(cornerRadius: 4)
                                                .fill(Theme.Colors.data.opacity(0.15))
                                            RoundedRectangle(cornerRadius: 4)
                                                .fill(Theme.Colors.data)
                                                .frame(width: max(width, CGFloat(fraction > 0 ? 4 : 0)))
                                        }
                                    }
                                    .frame(height: 10)
                                    Text("\(day.calories.formatted()) 千卡")
                                        .font(.subheadline.monospacedDigit())
                                        .foregroundStyle(Theme.Colors.data)
                                        .frame(minWidth: 84, alignment: .trailing)
                                }
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel("\(monthDayLabel(day.day))，\(day.calories.formatted()) 千卡")
                            }
                        }
                    }
                }
                Surface {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("记录食物").font(.headline)
                        HStack {
                            Picker("餐次", selection: $meal) { ForEach(["早餐", "午餐", "晚餐", "加餐"], id: \.self) { Text($0) } }.frame(width: 130)
                            TextField("食物名称", text: $name)
                            TextField("份量", text: $portion).frame(width: 100)
                        }
                        HStack {
                            TextField("千卡", value: $calories, format: .number)
                            TextField("蛋白质 g", value: $protein, format: .number)
                            TextField("碳水 g", value: $carbs, format: .number)
                            TextField("脂肪 g", value: $fat, format: .number)
                            Button("保存") {
                                store.addFoodEntry(FoodEntry(meal: meal, name: name, portion: portion, calories: calories, protein: protein, carbs: carbs, fat: fat))
                                name = ""; calories = 0; protein = 0; carbs = 0; fat = 0
                            }
                            .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                        }
                    }
                }
                ForEach(today.sorted { $0.loggedAt > $1.loggedAt }) { entry in
                    Surface {
                        HStack {
                            Text(entry.meal).foregroundStyle(Theme.Colors.data).frame(width: 60, alignment: .leading)
                            Text(entry.name)
                            Text(entry.portion).foregroundStyle(Theme.Colors.textMuted)
                            Spacer()
                            Text("\(Int(entry.calories)) 千卡")
                        }
                    }
                }
            }
            .padding(30).frame(maxWidth: 1000)
        }
        .sheet(isPresented: $editingGoals) {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                Text("每日营养目标").themeText(.title2)
                Text("填 0 可关闭对应目标。").themeText(.caption)
                TextField("热量 · 千卡", value: $calorieGoal, format: .number)
                TextField("蛋白质 · g", value: $proteinGoal, format: .number)
                HStack {
                    Button("取消") { editingGoals = false }
                    Button("保存目标") {
                        do {
                            var preferences = store.state.preferences
                            preferences.calorieGoal = calorieGoal
                            preferences.proteinGoal = proteinGoal
                            try store.setPreferences(preferences)
                            editingGoals = false
                        } catch { notice = error.localizedDescription; editingGoals = false }
                    }
                    .disabled(!(0...10_000).contains(calorieGoal) || !(0...1_000).contains(proteinGoal))
                    .buttonStyle(.themePrimary(.small))
                }
            }
            .padding(Theme.Spacing.xl)
            .frame(width: 320)
        }
        .alert("无法保存", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
            Button("好", role: .cancel) {}
        } message: { Text(notice ?? "") }
    }

    private var goalsCard: some View {
        Surface {
            VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                ThemeSectionHeader(title: "每日营养目标", actionTitle: "设置目标", action: {
                    calorieGoal = store.state.preferences.calorieGoal
                    proteinGoal = store.state.preferences.proteinGoal
                    editingGoals = true
                })
                NutritionGoalsSummary(progress: store.nutritionProgress())
            }
        }
    }

    @ViewBuilder private var quickFoodCard: some View {
        let quickFoods = frequent ? store.frequentFoods() : store.recentFoods()
        if !quickFoods.isEmpty {
            Surface {
                VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
                    Text("快速记录 · \(meal)").themeText(.title3)
                    Picker("常用食物", selection: $frequent) {
                        Text("最近吃过").tag(false)
                        Text("常吃").tag(true)
                    }
                    .pickerStyle(.segmented)
                    ForEach(quickFoods) { food in
                        HStack {
                            Text("\(food.name) · \(food.portion)")
                            Spacer()
                            Button("记录") {
                                do {
                                    _ = try store.relogFood(food, meal: meal)
                                } catch { notice = error.localizedDescription }
                            }
                        }
                    }
                }
            }
        }
    }

    private func monthDayLabel(_ day: String) -> String {
        let parts = day.split(separator: "-")
        guard parts.count == 3, let month = Int(parts[1]), let dayNumber = Int(parts[2]) else { return day }
        return "\(month)/\(dayNumber)"
    }
}

private struct MacBackupView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(eyebrow: "YOUR DATA", title: "数据备份")
                Surface { TrainingBackupActions() }
            }
            .padding(30).frame(maxWidth: 760)
        }
    }
}

private struct MacBodyView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var weight = 0.0
    @State private var bodyFat = 0.0
    var body: some View {
        let trend = WellnessTrend.bodyTrend(store.state.bodyEntries)
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(eyebrow: "YOUR BODY", title: "身体数据")
                if let latest = trend.latest {
                    Surface {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                Text("\(store.state.preferences.weightUnit.format(kilograms: latest.weight))")
                                    .font(.system(size: 26, weight: .bold))
                                    .foregroundStyle(Theme.Colors.data)
                                if let delta = trend.weightDelta {
                                    Text(weightDeltaLabel(delta))
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(delta == 0 ? Theme.Colors.textMuted : Theme.Colors.data)
                                }
                            }
                            Text("最近体重 · \(latest.recordedAt.formatted(date: .abbreviated, time: .omitted))")
                                .font(.caption)
                                .foregroundStyle(Theme.Colors.textMuted)
                        }
                    }
                }
                if trend.points.count >= 2 {
                    MacMetricChart(title: "体重趋势", unit: store.state.preferences.weightUnit.symbol, samples: trend.points) { store.state.preferences.weightUnit.fromKilograms($0.weight) }
                }
                if trend.fatPoints.count >= 2 {
                    MacMetricChart(title: "体脂率趋势", unit: "%", samples: trend.fatPoints) { $0.bodyFat ?? 0 }
                }
                Surface {
                    HStack {
                        TextField("体重 \(store.state.preferences.weightUnit.symbol)", value: $weight, format: .number)
                        TextField("体脂率 %", value: $bodyFat, format: .number)
                        Button("记录") { store.addBodyEntry(weight: store.state.preferences.weightUnit.toKilograms(weight), bodyFat: bodyFat > 0 ? bodyFat : nil) }
                            .disabled(weight <= 0)
                    }
                }
                ForEach(store.state.bodyEntries.sorted { $0.recordedAt > $1.recordedAt }) { entry in
                    Surface {
                        HStack {
                            Text(entry.recordedAt.formatted(date: .abbreviated, time: .shortened))
                            Spacer()
                            Text("\(store.state.preferences.weightUnit.format(kilograms: entry.weight))")
                            if let fat = entry.bodyFat { Text("体脂 \(fat.formatted()) %").foregroundStyle(Theme.Colors.textMuted) }
                        }
                    }
                }
            }
            .padding(30).frame(maxWidth: 1000)
        }
    }

    private func weightDeltaLabel(_ delta: Double) -> String {
        if delta == 0 { return "与上次相同" }
        let magnitude = store.state.preferences.weightUnit.format(kilograms: abs(delta))
        return delta > 0 ? "+\(magnitude)" : "-\(magnitude)"
    }
}

private struct MacMetricChart: View {
    let title: String
    let unit: String
    let samples: [BodyTrendPoint]
    let value: (BodyTrendPoint) -> Double

    var body: some View {
        let ordered = samples.sorted { lhs, rhs in
            if lhs.recordedAt != rhs.recordedAt { return lhs.recordedAt < rhs.recordedAt }
            return lhs.id < rhs.id
        }
        Surface {
            VStack(alignment: .leading, spacing: 12) {
                Text(title).font(.headline)
                Chart(ordered) { point in
                    BarMark(
                        x: .value("日期", point.recordedAt),
                        y: .value(title, value(point))
                    )
                    .foregroundStyle(Theme.Colors.data)
                    .accessibilityLabel(point.recordedAt.formatted(date: .abbreviated, time: .omitted))
                    .accessibilityValue("\(value(point).formatted()) \(unit)")
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine()
                        AxisValueLabel(format: .dateTime.month().day())
                    }
                }
                .chartYAxisLabel(unit)
                .frame(height: 150)
            }
        }
    }
}

private struct WeightField: View {
    let kilograms: Double
    let unit: WeightUnit
    let save: (Double) -> Void
    @State private var draft: String?
    @FocusState private var editing: Bool

    var body: some View {
        let formatted = unit.format(kilograms: kilograms, includeUnit: false)
        TextField(unit.symbol, text: Binding(get: { draft ?? formatted }, set: { draft = $0 }))
            .accessibilityLabel("重量，\(unit.label)")
            .focused($editing)
            .onSubmit { commit(original: formatted) }
            .onChange(of: editing) { _, focused in
                if !focused { commit(original: formatted) }
            }
    }

    private func commit(original: String) {
        defer { draft = nil }
        guard let draft, draft != original, let weight = unit.parseKilograms(draft), weight <= 2000 else { return }
        save(weight)
    }
}
