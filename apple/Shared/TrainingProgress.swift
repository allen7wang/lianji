import Foundation

struct TrainingProgress {
    private let workouts: [Workout]
    let calendar: Calendar

    init(workouts: [Workout], calendar: Calendar = .current) {
        self.workouts = workouts.filter { $0.endedAt != nil }.sorted { $0.startedAt > $1.startedAt }
        var localCalendar = calendar
        localCalendar.firstWeekday = 2
        self.calendar = localCalendar
    }

    func week(containing date: Date) -> TrainingWeek {
        guard let week = calendar.dateInterval(of: .weekOfYear, for: date) else {
            return TrainingWeek(start: calendar.startOfDay(for: date), days: [])
        }
        let byDay = Dictionary(grouping: workouts.filter { $0.startedAt >= week.start && $0.startedAt < week.end }) {
            calendar.startOfDay(for: $0.startedAt)
        }
        let days = (0..<7).compactMap { offset -> TrainingDay? in
            guard let date = calendar.date(byAdding: .day, value: offset, to: week.start) else { return nil }
            let day = calendar.startOfDay(for: date)
            return TrainingDay(date: day, workouts: byDay[day, default: []])
        }
        return TrainingWeek(start: week.start, days: days)
    }

    func recentWeeks(through date: Date) -> [TrainingWeek] {
        (-3...0).compactMap { offset in
            calendar.date(byAdding: .weekOfYear, value: offset, to: date).map { week(containing: $0) }
        }
    }

    func exerciseOptions(_ exercises: [Exercise]) -> [Exercise] {
        var performedIds = Set<String>()
        for workout in workouts {
            performedIds.formUnion(workout.completedSets.map(\.exerciseId))
        }
        return exercises.filter { performedIds.contains($0.id) }
    }

    func exercise(_ id: String) -> ExerciseProgress {
        var records = ExerciseRecords()
        var recent: [ExerciseSession] = []
        var recentByMetric: [ProgressMetric: [ExerciseSession]] = [:]
        for workout in workouts {
            var session = ExerciseRecords()
            for set in workout.completedSets where set.exerciseId == id {
                records.add(set)
                session.add(set)
            }
            let metrics = session.metrics
            guard !metrics.isEmpty else { continue }
            let entry = ExerciseSession(id: workout.id, date: workout.startedAt, records: session)
            if recent.count < 5 {
                recent.append(entry)
            }
            for metric in metrics where recentByMetric[metric, default: []].count < 8 {
                recentByMetric[metric, default: []].append(entry)
            }
        }
        return ExerciseProgress(records: records, recent: recent, recentByMetric: recentByMetric)
    }
}

struct TrainingWeek: Identifiable {
    let start: Date
    let days: [TrainingDay]

    var id: Date { start }
    var completedSets: Int { days.reduce(0) { $0 + $1.completedSets } }

    func activeDays(through date: Date = .distantFuture) -> Int {
        days.filter { $0.date <= date && $0.completedSets > 0 }.count
    }
}

struct TrainingDay: Identifiable {
    let date: Date
    let workouts: [Workout]
    let completedSets: Int

    init(date: Date, workouts: [Workout]) {
        self.date = date
        self.workouts = workouts
        self.completedSets = workouts.reduce(0) { $0 + $1.completedSets.count }
    }

    var id: Date { date }
}

struct ExerciseProgress {
    let records: ExerciseRecords
    let recent: [ExerciseSession]
    let recentByMetric: [ProgressMetric: [ExerciseSession]]
}

struct ExerciseSession: Identifiable {
    let id: String
    let date: Date
    let records: ExerciseRecords
}

enum ProgressMetric: String, CaseIterable, Identifiable {
    case weight = "最大重量"
    case reps = "最多次数"
    case seconds = "最长时长"

    var id: Self { self }
    var unit: String {
        switch self {
        case .weight: "kg"
        case .reps: "次"
        case .seconds: "秒"
        }
    }
}

struct ExerciseRecords {
    private(set) var heaviestSet: TrainingSet?
    private var reps = 0
    private var seconds = 0
    var metrics: [ProgressMetric] { ProgressMetric.allCases.filter { value($0) != nil } }

    mutating func add(_ set: TrainingSet) {
        guard set.reps > 0 else { return }
        if set.unit == .seconds {
            seconds = max(seconds, set.reps)
            return
        }
        reps = max(reps, set.reps)
        guard set.weight > 0 else { return }
        if let best = heaviestSet,
           best.weight > set.weight || (best.weight == set.weight && best.reps >= set.reps) { return }
        heaviestSet = set
    }

    func value(_ metric: ProgressMetric) -> Double? {
        switch metric {
        case .weight: heaviestSet?.weight
        case .reps: reps > 0 ? Double(reps) : nil
        case .seconds: seconds > 0 ? Double(seconds) : nil
        }
    }

    func label(_ metric: ProgressMetric) -> String? {
        guard let value = value(metric) else { return nil }
        if metric == .weight, let heaviestSet {
            return "\(value.formatted()) kg × \(heaviestSet.reps) 次"
        }
        return "\(value.formatted()) \(metric.unit)"
    }
}

struct TrainingComparison {
    private let saved: [Workout]

    init(workouts: [Workout]) {
        saved = workouts.filter { $0.endedAt != nil }.sorted { first, second in
            if first.startedAt != second.startedAt { return first.startedAt > second.startedAt }
            if first.endedAt != second.endedAt {
                return (first.endedAt ?? .distantPast) > (second.endedAt ?? .distantPast)
            }
            return first.id < second.id
        }
    }

    func previousExerciseSets(for workout: Workout, exerciseId: String? = nil) -> [String: [PreviousExerciseSets]] {
        var needed = Set(workout.sets.lazy.filter { exerciseId == nil || $0.exerciseId == exerciseId }.map(ExerciseUnit.init))
        var result: [String: [PreviousExerciseSets]] = [:]
        for previous in saved where isPrior(previous, to: workout) {
            guard !needed.isEmpty else { break }
            let completed = comparableSets(in: previous)
            let groups = Dictionary(grouping: completed, by: ExerciseUnit.init)
            for (exercise, sets) in groups where needed.remove(exercise) != nil {
                let ordered = sets.sorted { $0.setNumber < $1.setNumber }
                result[exercise.id, default: []].append(PreviousExerciseSets(unit: exercise.unit, workout: previous, sets: ordered))
            }
        }
        return result.mapValues { $0.sorted { $0.unit.rawValue < $1.unit.rawValue } }
    }

    func previousPlanWorkout(for workout: Workout) -> PlanWorkoutComparison? {
        guard workout.endedAt != nil, let planId = workout.planId, !planId.isEmpty else { return nil }
        for previous in saved where previous.planId == planId && isPrior(previous, to: workout) {
            let sets = comparableSets(in: previous)
            guard !sets.isEmpty else { continue }
            return PlanWorkoutComparison(
                workout: previous,
                previous: WorkoutComparisonTotals(sets: sets),
                current: WorkoutComparisonTotals(sets: comparableSets(in: workout))
            )
        }
        return nil
    }

    private func isPrior(_ previous: Workout, to workout: Workout) -> Bool {
        guard let endedAt = previous.endedAt else { return false }
        return previous.id != workout.id && previous.startedAt <= endedAt && endedAt <= workout.startedAt
    }

    private func comparableSets(in workout: Workout) -> [TrainingSet] {
        workout.sets.filter { $0.completed && $0.reps > 0 }
    }
}

private struct ExerciseUnit: Hashable {
    let id: String
    let unit: TrainingUnit

    init(_ set: TrainingSet) {
        id = set.exerciseId
        unit = set.unit ?? .reps
    }
}

struct PreviousExerciseSets: Identifiable {
    let unit: TrainingUnit
    let workout: Workout
    let sets: [TrainingSet]

    var id: TrainingUnit { unit }
}

struct WorkoutComparisonTotals {
    let completedSets: Int
    let volume: Double
    let timedSeconds: Double

    init(sets: [TrainingSet]) {
        completedSets = sets.count
        volume = sets.reduce(0) { total, set in
            guard set.unit != .seconds, set.weight.isFinite && set.weight > 0 else { return total }
            return total + set.weight * Double(set.reps)
        }
        timedSeconds = sets.reduce(0) { $0 + ($1.unit == .seconds ? Double($1.reps) : 0) }
    }
}

struct PlanWorkoutComparison {
    let workout: Workout
    let previous: WorkoutComparisonTotals
    let current: WorkoutComparisonTotals
}
