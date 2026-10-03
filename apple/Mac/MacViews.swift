import SwiftUI

private enum Palette {
    static let background = Color(red: 0.047, green: 0.063, blue: 0.078)
    static let surface = Color(red: 0.09, green: 0.11, blue: 0.13)
    static let accent = Color(red: 0.725, green: 0.953, blue: 0.416)
    static let muted = Color(red: 0.57, green: 0.63, blue: 0.61)
}

private enum Section: String, CaseIterable, Identifiable {
    case today = "今天"
    case plans = "训练计划"
    case exercises = "动作库"
    case history = "训练历史"
    case nutrition = "饮食记录"
    case body = "身体数据"

    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .today: "house.fill"
        case .plans: "calendar"
        case .exercises: "dumbbell.fill"
        case .history: "chart.bar.fill"
        case .nutrition: "fork.knife"
        case .body: "figure.strengthtraining.traditional"
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
                case .exercises: MacExercisesView()
                case .history: MacHistoryView()
                case .nutrition: MacNutritionView()
                case .body: MacBodyView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Palette.background)
        }
        .tint(Palette.accent)
    }
}

private struct Surface<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct PageHeader: View {
    let eyebrow: String
    let title: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eyebrow).font(.caption.bold()).tracking(2).foregroundStyle(Palette.accent)
            Text(title).font(.system(size: 32, weight: .bold))
        }
    }
}

private struct Stat: View {
    let value: String
    let label: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(value).font(.system(size: 26, weight: .bold)).foregroundStyle(Palette.accent)
            Text(label).font(.caption).foregroundStyle(Palette.muted)
        }
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
                Surface {
                    HStack(spacing: 30) {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(store.activeWorkout == nil ? "把今天练成更强的一天" : "继续你的训练")
                                .font(.system(size: 25, weight: .bold))
                            Text(store.activeWorkout == nil ? "按计划训练，或自由记录每一组。" : store.activeWorkout!.name)
                                .foregroundStyle(Palette.muted)
                            if store.activeWorkout == nil {
                                Button("开始自由训练") { store.startWorkout(planId: nil) }
                                    .buttonStyle(.borderedProminent)
                            }
                        }
                        Spacer()
                        Image(systemName: "dumbbell.fill").font(.system(size: 82)).foregroundStyle(Palette.accent)
                    }
                }
                HStack(spacing: 14) {
                    Surface { Stat(value: "\(week.count)", label: "本周训练次数") }
                    Surface { Stat(value: "\(week.reduce(0) { $0 + $1.completedSets.count })", label: "本周完成组数") }
                    Surface { Stat(value: "\(Int(week.reduce(0) { $0 + $1.volume })) kg", label: "本周训练容量") }
                }
                if store.activeWorkout != nil { MacActiveWorkout() }
                Text("训练计划").font(.title2.bold())
                ForEach(store.state.plans) { plan in
                    Surface {
                        HStack {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(plan.name).font(.headline)
                                Text("\(plan.items.count) 个动作 · \(plan.note)").font(.caption).foregroundStyle(Palette.muted)
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

private struct MacPlansView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var editing: Plan?
    @State private var adding = false
    @State private var showTemplates = false
    @State private var category = "全部"
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
                    }.frame(maxWidth: 360)
                    ForEach(TrainingProgram.catalog.filter { category == "全部" || $0.category == category }) { template in
                        Surface {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("\(template.name) · \(template.subtitle)").font(.title3.bold())
                                Text(template.description).foregroundStyle(Palette.muted)
                                Text("\(template.level) · \(template.equipment.joined(separator: " / "))").font(.caption).foregroundStyle(Palette.muted)
                                Text(template.frequency).font(.caption)
                                Text("一轮 \(template.days.count) 个训练日 · \(template.days.map(\.name).joined(separator: " / "))").font(.caption)
                                Button("查看模板") { program = template }
                            }
                        }
                    }
                } else { ForEach(store.state.plans) { plan in
                    Surface {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(plan.name).font(.title3.bold())
                                    Text(plan.note).font(.caption).foregroundStyle(Palette.muted)
                                }
                                Spacer()
                                Button("编辑") { editing = plan }
                                Button("开始训练") { store.startWorkout(planId: plan.id) }
                                    .disabled(store.activeWorkout != nil)
                            }
                            Divider()
                            ForEach(plan.items) { item in
                                HStack {
                                    Text(store.exercise(item.exerciseId)?.name ?? "未知动作")
                                    Spacer()
                                    Text("\(item.sets) × \(item.reps) · \(item.weight.formatted()) kg")
                                        .foregroundStyle(Palette.muted)
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
                                    HStack { Text(item.name); Spacer(); Text("\(item.sets) 组 × \(item.reps) 次").foregroundStyle(.secondary) }
                                }
                            }.padding(8)
                        }
                    }
                }
            }
            Text("训练日之间可安排休息。添加后可编辑；目标重量初始为 0 kg，请按实际填写。").font(.caption).foregroundStyle(.secondary)
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
                    draft.items.append(PlanItem(exerciseId: selectedExercise, sets: 3, reps: 10, weight: 0))
                    selectedExercise = ""
                }
            }
            List {
                ForEach($draft.items) { $item in
                    HStack {
                        Text(store.exercise(item.exerciseId)?.name ?? "未知动作").frame(width: 150, alignment: .leading)
                        Stepper("\(item.sets) 组", value: $item.sets, in: 1...20).frame(width: 110)
                        Stepper("\(item.reps) 次", value: $item.reps, in: 1...100).frame(width: 110)
                        TextField("kg", value: $item.weight, format: .number).frame(width: 60)
                        Button(role: .destructive) { draft.items.removeAll { $0.id == item.id } } label: {
                            Image(systemName: "trash")
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
                    Image(systemName: "dumbbell.fill").foregroundStyle(Palette.accent).frame(width: 30)
                    Text(exercise.name)
                    Spacer()
                    Text("\(exercise.muscle) · \(exercise.equipment)").foregroundStyle(Palette.muted)
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
    @State private var demoExercise: Exercise?

    var body: some View {
        if let workout = store.activeWorkout {
            Surface {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("正在训练 · \(workout.name)").font(.title3.bold())
                            Text("已完成 \(workout.completedSets.count) / \(workout.sets.count) 组 · 容量 \(Int(workout.volume)) kg")
                                .foregroundStyle(Palette.muted)
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
                            Text(remaining > 0 ? "组间休息 · \(remaining) 秒" : "休息结束，可以开始下一组")
                                .font(.subheadline.bold())
                                .foregroundStyle(Palette.accent)
                        }
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
                            ForEach(workout.sets.filter { $0.exerciseId == exerciseId }) { set in
                                HStack(spacing: 12) {
                                    Text("第 \(set.setNumber) 组").foregroundStyle(Palette.muted).frame(width: 75, alignment: .leading)
                                    TextField("重量", value: Binding(get: { set.weight }, set: { store.updateSet(set.id, weight: $0) }), format: .number)
                                        .frame(width: 70)
                                    Text("kg")
                                    TextField("次数", value: Binding(get: { set.reps }, set: { store.updateSet(set.id, reps: $0) }), format: .number)
                                        .frame(width: 70)
                                    Text("次")
                                    Toggle("完成", isOn: Binding(get: { set.completed }, set: {
                                        store.updateSet(set.id, completed: $0)
                                        if $0 { restUntil = .now.addingTimeInterval(90) }
                                    }))
                                        .toggleStyle(.checkbox)
                                    Button(role: .destructive) { store.deleteSet(set.id) } label: { Image(systemName: "minus.circle") }
                                        .buttonStyle(.plain)
                                }
                            }
                            Button("添加一组", systemImage: "plus") { store.addSet(for: exerciseId) }
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
        }
    }
}

private struct MacHistoryView: View {
    @EnvironmentObject private var store: TrainingStore
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(eyebrow: "YOUR PROGRESS", title: "训练历史")
                HStack(spacing: 14) {
                    Surface { Stat(value: "\(store.finishedWorkouts.count)", label: "累计训练") }
                    Surface { Stat(value: "\(Int(store.finishedWorkouts.reduce(0) { $0 + $1.volume })) kg", label: "累计容量") }
                }
                ForEach(store.finishedWorkouts) { workout in
                    Surface {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(workout.name).font(.headline)
                                Spacer()
                                Text(workout.startedAt.formatted(date: .abbreviated, time: .shortened))
                                    .foregroundStyle(Palette.muted)
                                Button(role: .destructive) { store.deleteWorkout(workout.id) } label: { Image(systemName: "trash") }
                            }
                            Text("\(workout.completedSets.count) 组 · \(Int(workout.volume)) kg 容量")
                                .font(.subheadline).foregroundStyle(Palette.accent)
                            ForEach(workout.completedSets) { set in
                                Text("\(store.exercise(set.exerciseId)?.name ?? "未知动作") · \(set.weight.formatted()) kg × \(set.reps) 次")
                                    .font(.caption).foregroundStyle(Palette.muted)
                            }
                        }
                    }
                }
                if store.finishedWorkouts.isEmpty { Text("还没有训练记录").foregroundStyle(Palette.muted) }
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
    private var today: [FoodEntry] { store.state.foodEntries.filter { Calendar.current.isDateInToday($0.loggedAt) } }
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
                            Text(entry.meal).foregroundStyle(Palette.accent).frame(width: 60, alignment: .leading)
                            Text(entry.name)
                            Text(entry.portion).foregroundStyle(Palette.muted)
                            Spacer()
                            Text("\(Int(entry.calories)) 千卡")
                        }
                    }
                }
            }
            .padding(30).frame(maxWidth: 1000)
        }
    }
}

private struct MacBodyView: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var weight = 0.0
    @State private var bodyFat = 0.0
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(eyebrow: "YOUR BODY", title: "身体数据")
                if let latest = store.state.bodyEntries.max(by: { $0.recordedAt < $1.recordedAt }) {
                    Surface { Stat(value: "\(latest.weight.formatted()) kg", label: "最近体重 · \(latest.recordedAt.formatted(date: .abbreviated, time: .omitted))") }
                }
                Surface {
                    HStack {
                        TextField("体重 kg", value: $weight, format: .number)
                        TextField("体脂率 %", value: $bodyFat, format: .number)
                        Button("记录") { store.addBodyEntry(weight: weight, bodyFat: bodyFat > 0 ? bodyFat : nil) }
                            .disabled(weight <= 0)
                    }
                }
                ForEach(store.state.bodyEntries.sorted { $0.recordedAt > $1.recordedAt }) { entry in
                    Surface {
                        HStack {
                            Text(entry.recordedAt.formatted(date: .abbreviated, time: .shortened))
                            Spacer()
                            Text("\(entry.weight.formatted()) kg")
                            if let fat = entry.bodyFat { Text("体脂 \(fat.formatted()) %").foregroundStyle(Palette.muted) }
                        }
                    }
                }
            }
            .padding(30).frame(maxWidth: 1000)
        }
    }
}
