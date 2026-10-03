import Foundation

struct Exercise: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var muscle: String
    var equipment: String
    var isCustom: Bool = false
}

struct ExtraExercise: Decodable {
    var id: String
    var name: String
    var muscle: String
    var equipment: String

    static let catalog: [ExtraExercise] = {
        guard let url = Bundle.main.url(forResource: "extra-exercises", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let entries = try? JSONDecoder().decode([ExtraExercise].self, from: data) else { return [] }
        return entries
    }()
}

struct PlanItem: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var exerciseId: String
    var sets: Int
    var reps: Int
    var weight: Double
}

struct Plan: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var note: String = ""
    var createdAt: Date = .now
    var items: [PlanItem]
}

struct TrainingSet: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var exerciseId: String
    var setNumber: Int
    var weight: Double
    var reps: Int
    var completed: Bool = false
}

struct Workout: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var planId: String?
    var name: String
    var startedAt: Date = .now
    var endedAt: Date?
    var note: String = ""
    var sets: [TrainingSet]

    var completedSets: [TrainingSet] { sets.filter(\.completed) }
    var exerciseIds: [String] {
        var seen = Set<String>()
        return sets.compactMap { seen.insert($0.exerciseId).inserted ? $0.exerciseId : nil }
    }
    var volume: Double { completedSets.reduce(0) { $0 + $1.weight * Double($1.reps) } }
}

struct BodyEntry: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var recordedAt: Date = .now
    var weight: Double
    var bodyFat: Double?
}

struct FoodEntry: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var loggedAt: Date = .now
    var meal: String
    var name: String
    var portion: String
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
}

struct AppState: Codable {
    var exercises: [Exercise]
    var plans: [Plan]
    var workouts: [Workout]
    var bodyEntries: [BodyEntry]
    var foodEntries: [FoodEntry]

    mutating func addMissingExercises() {
        for entry in ExtraExercise.catalog where !exercises.contains(where: { !$0.isCustom && $0.name == entry.name }) {
            exercises.append(Exercise(id: "builtin:\(entry.id)", name: entry.name, muscle: entry.muscle, equipment: entry.equipment))
        }
    }

    static func starter() -> AppState {
        let entries: [(String, String, String, String)] = [
            ("barbell_bench", "杠铃卧推", "胸", "杠铃"),
            ("incline_dumbbell_press", "上斜哑铃卧推", "胸", "哑铃"),
            ("dips", "双杠臂屈伸", "胸", "自重"),
            ("cable_fly", "绳索夹胸", "胸", "绳索"),
            ("push_up", "俯卧撑", "胸", "自重"),
            ("pull_up", "引体向上", "背", "自重"),
            ("barbell_row", "杠铃划船", "背", "杠铃"),
            ("lat_pulldown", "高位下拉", "背", "器械"),
            ("seated_row", "坐姿划船", "背", "器械"),
            ("single_arm_row", "单臂哑铃划船", "背", "哑铃"),
            ("barbell_squat", "杠铃深蹲", "腿", "杠铃"),
            ("leg_press", "腿举", "腿", "器械"),
            ("romanian_deadlift", "罗马尼亚硬拉", "腿", "杠铃"),
            ("bulgarian_split_squat", "保加利亚分腿蹲", "腿", "哑铃"),
            ("leg_extension", "腿屈伸", "腿", "器械"),
            ("leg_curl", "腿弯举", "腿", "器械"),
            ("calf_raise", "站姿提踵", "腿", "器械"),
            ("overhead_press", "杠铃肩推", "肩", "杠铃"),
            ("lateral_raise", "哑铃侧平举", "肩", "哑铃"),
            ("reverse_fly", "反向飞鸟", "肩", "哑铃"),
            ("face_pull", "面拉", "肩", "绳索"),
            ("barbell_curl", "杠铃弯举", "手臂", "杠铃"),
            ("hammer_curl", "锤式弯举", "手臂", "哑铃"),
            ("triceps_pushdown", "绳索下压", "手臂", "绳索"),
            ("skull_crusher", "仰卧臂屈伸", "手臂", "杠铃"),
            ("plank", "平板支撑", "核心", "自重"),
            ("crunch", "卷腹", "核心", "自重"),
            ("hanging_leg_raise", "悬垂举腿", "核心", "自重"),
            ("deadlift", "硬拉", "全身", "杠铃"),
            ("kettlebell_swing", "壶铃摆动", "全身", "壶铃")
        ]
        let exercises = entries.map { Exercise(id: $0.0, name: $0.1, muscle: $0.2, equipment: $0.3) }
        func items(_ ids: [String]) -> [PlanItem] {
            ids.map { PlanItem(exerciseId: $0, sets: 3, reps: 10, weight: 0) }
        }
        let plans = [
            Plan(id: "starter_push", name: "推日 · 胸肩三头", note: "适合上肢推力训练", items: items(["barbell_bench", "incline_dumbbell_press", "overhead_press", "lateral_raise", "triceps_pushdown"])),
            Plan(id: "starter_pull", name: "拉日 · 背部二头", note: "适合上肢拉力训练", items: items(["pull_up", "barbell_row", "lat_pulldown", "face_pull", "barbell_curl"])),
            Plan(id: "starter_legs", name: "腿日 · 下肢核心", note: "适合下肢力量训练", items: items(["barbell_squat", "romanian_deadlift", "leg_press", "leg_curl", "plank"]))
        ]
        var state = AppState(exercises: exercises, plans: plans, workouts: [], bodyEntries: [], foodEntries: [])
        state.addMissingExercises()
        return state
    }
}
