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
                        ForEach(store.state.plans) { plan in
                            Button {
                                store.startWorkout(planId: plan.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(plan.name).font(.subheadline.bold()).lineLimit(2)
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
                        Label("训练历史", systemImage: "chart.bar.fill")
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

private struct WatchProgramLibrary: View {
    @State private var category = "全部"
    var body: some View {
        List {
            Picker("训练场景", selection: $category) {
                ForEach(TrainingProgram.categories, id: \.self) { Text($0).tag($0) }
            }
            ForEach(TrainingProgram.catalog.filter { category == "全部" || $0.category == category }) { program in
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
                Text("训练日间可休息，重量在训练时按实际填写。").font(.caption2).foregroundStyle(.secondary)
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
                        Text("\(item.sets) 组 × \(item.reps) 次").font(.caption2).foregroundStyle(.secondary)
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(store.exercise(exerciseId)?.name ?? "未知动作")
                    .font(.headline).lineLimit(2)
                if let exercise = store.exercise(exerciseId), ExerciseDemo.find(exercise) != nil {
                    NavigationLink("查看动图", destination: ExerciseDemoView(exercise: exercise))
                }
                if let restUntil {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let remaining = max(0, Int(restUntil.timeIntervalSince(context.date)))
                        Text(remaining > 0 ? "休息 \(remaining) 秒" : "可以开始下一组")
                            .font(.caption.bold())
                            .foregroundStyle(lime)
                    }
                }
                ForEach(store.activeWorkout?.sets.filter { $0.exerciseId == exerciseId } ?? []) { set in
                    VStack(alignment: .leading, spacing: 7) {
                        Text("第 \(set.setNumber) 组").font(.caption.bold()).foregroundStyle(lime)
                        Stepper(value: Binding(get: { set.weight }, set: { store.updateSet(set.id, weight: $0) }), in: 0...500, step: 2.5) {
                            Text("\(set.weight.formatted()) kg")
                        }
                        Stepper(value: Binding(get: { set.reps }, set: { store.updateSet(set.id, reps: $0) }), in: 0...100) {
                            Text("\(set.reps) 次")
                        }
                        Button {
                            store.updateSet(set.id, completed: !set.completed)
                            if !set.completed { restUntil = .now.addingTimeInterval(90) }
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

private struct WatchHistoryView: View {
    @EnvironmentObject private var store: TrainingStore
    var body: some View {
        List(store.finishedWorkouts.prefix(20)) { workout in
            VStack(alignment: .leading, spacing: 4) {
                Text(workout.name).font(.subheadline.bold()).lineLimit(2)
                Text(workout.startedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption2).foregroundStyle(.secondary)
                Text("\(workout.completedSets.count) 组 · \(Int(workout.volume)) kg")
                    .font(.caption2).foregroundStyle(lime)
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
