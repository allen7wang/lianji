import Foundation

struct Exercise: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var muscle: String
    var equipment: String
    var isCustom: Bool = false
    var defaultUnit: TrainingUnit {
        !isCustom && (name == "平板支撑" || ExtraExercise.catalog.contains { $0.name == name && $0.recording == "seconds" }) ? .seconds : .reps
    }
}

enum TrainingUnit: String, Codable, Hashable { case reps, seconds }

struct ExtraExercise: Decodable {
    var id: String
    var name: String
    var muscle: String
    var equipment: String
    var recording: String?

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
    var unit: TrainingUnit?
    var restSeconds: Int?
    var targetLabel: String { "\(reps) \(unit == .seconds ? "秒" : "次")" }
}

struct Plan: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var name: String
    var note: String = ""
    var createdAt: Date = .now
    var items: [PlanItem]
}

/// 组次类型：正式组计入统计，热身组只作记录（见 docs/data-contract.md §4）。
enum SetKind: String, Codable, Hashable, CaseIterable {
    case working, warmup

    var label: String {
        switch self {
        case .working: "正式组"
        case .warmup: "热身组"
        }
    }
}

struct TrainingSet: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var exerciseId: String
    var setNumber: Int
    var weight: Double
    var reps: Int
    var completed: Bool = false
    var unit: TrainingUnit?
    var restSeconds: Int?
    var kind: SetKind = .working
    var rpe: Double? = nil
    var targetLabel: String { "\(reps) \(unit == .seconds ? "秒" : "次")" }
    var isWarmup: Bool { kind == .warmup }
    var isWorking: Bool { kind == .working }

    /// RPE 为 5–10、步长 0.5。
    static func isValidRPE(_ value: Double) -> Bool {
        value.isFinite && value >= 5 && value <= 10 && (value * 2).rounded() == value * 2
    }
    static let rpeOptions: [Double] = stride(from: 5.0, through: 10.0, by: 0.5).map { $0 }
}

extension TrainingSet {
    // 旧版 training.json 没有 kind / rpe；无法识别的值也按缺省处理，避免整份数据解码失败。
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        exerciseId = try container.decode(String.self, forKey: .exerciseId)
        setNumber = try container.decode(Int.self, forKey: .setNumber)
        weight = try container.decode(Double.self, forKey: .weight)
        reps = try container.decode(Int.self, forKey: .reps)
        completed = try container.decodeIfPresent(Bool.self, forKey: .completed) ?? false
        unit = try container.decodeIfPresent(TrainingUnit.self, forKey: .unit)
        restSeconds = try container.decodeIfPresent(Int.self, forKey: .restSeconds)
        kind = ((try? container.decodeIfPresent(SetKind.self, forKey: .kind)) ?? nil) ?? .working
        rpe = ((try? container.decodeIfPresent(Double.self, forKey: .rpe)) ?? nil).flatMap { TrainingSet.isValidRPE($0) ? $0 : nil }
    }
}

struct ExerciseReplacementRequest: Identifiable {
    let workoutId: String
    let exerciseId: String
    let setIds: [String]

    var id: String { exerciseId }
}

struct Workout: Identifiable, Codable, Hashable {
    var id: String = UUID().uuidString
    var planId: String?
    var name: String
    var startedAt: Date = .now
    var endedAt: Date?
    var note: String = ""
    var sets: [TrainingSet]

    /// 全部已完成组（含热身组）：决定能否保存、是否计入训练天数。
    var completedSets: [TrainingSet] { sets.filter(\.completed) }
    /// 已完成的正式组：用于容量、纪录、对照等统计。
    var completedWorkingSets: [TrainingSet] { sets.filter { $0.completed && $0.kind == .working } }
    var exerciseIds: [String] {
        var seen = Set<String>()
        return sets.compactMap { seen.insert($0.exerciseId).inserted ? $0.exerciseId : nil }
    }
    /// 正式组在本动作中的序号（从 1 开始）；热身组或找不到时为 nil。界面上热身组显示 `W`。
    func workingSetOrdinal(of setId: String) -> Int? {
        guard let set = sets.first(where: { $0.id == setId }), set.kind == .working else { return nil }
        let rows = sets.filter { $0.exerciseId == set.exerciseId && $0.kind == .working }
        return rows.firstIndex { $0.id == setId }.map { $0 + 1 }
    }
        /// 容量 = Σ 已完成正式组的 重量 × 次数（按秒组不计入）。
    var volume: Double { completedWorkingSets.reduce(0) { $0 + ($1.unit == .seconds ? 0 : $1.weight * Double($1.reps)) } }
}

struct ScheduledTraining: Identifiable, Codable, Hashable {
    let planId: String
    let day: String

    var id: Self { self }

    static func localDay(_ date: Date, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }
}

enum TrainingScheduleStatus: String {
    case completed = "已完成"
    case pending = "待训练"
    case upcoming = "已安排"
    case missed = "已错过"
}

struct TrainingScheduleItem: Identifiable {
    let entry: ScheduledTraining
    let plan: Plan
    let status: TrainingScheduleStatus

    var id: ScheduledTraining { entry }
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
    var weeklyGoalDays: Int? = nil
    var trainingSchedule: [ScheduledTraining]? = nil
    var favoritePlanIds: [String]? = nil
    /// v3：重量单位与营养目标（进入备份）。旧数据缺省为默认值。
    var preferences: AppPreferences = AppPreferences()

    mutating func addMissingExercises() {
        for entry in ExtraExercise.catalog where !exercises.contains(where: { !$0.isCustom && $0.name == entry.name }) {
            exercises.append(Exercise(id: "builtin:\(entry.id)", name: entry.name, muscle: entry.muscle, equipment: entry.equipment))
        }
    }

    static func starter() -> AppState {
        let exercises = BuiltinExerciseCatalog.starter.map { Exercise(id: $0.id, name: $0.name, muscle: $0.muscle, equipment: $0.equipment) }
        func items(_ ids: [String]) -> [PlanItem] {
            ids.map { PlanItem(exerciseId: $0, sets: 3, reps: 10, weight: 0, unit: $0 == "plank" ? .seconds : .reps, restSeconds: 90) }
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

extension AppState {
    // 逐项容错：v3 之前的 training.json 没有 preferences；偏好字段异常时回退默认值，不影响训练数据。
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        exercises = try container.decode([Exercise].self, forKey: .exercises)
        plans = try container.decode([Plan].self, forKey: .plans)
        workouts = try container.decode([Workout].self, forKey: .workouts)
        bodyEntries = try container.decode([BodyEntry].self, forKey: .bodyEntries)
        foodEntries = try container.decode([FoodEntry].self, forKey: .foodEntries)
        weeklyGoalDays = try container.decodeIfPresent(Int.self, forKey: .weeklyGoalDays)
        trainingSchedule = try container.decodeIfPresent([ScheduledTraining].self, forKey: .trainingSchedule)
        favoritePlanIds = try container.decodeIfPresent([String].self, forKey: .favoritePlanIds)
        preferences = ((try? container.decodeIfPresent(AppPreferences.self, forKey: .preferences)) ?? nil) ?? AppPreferences()
    }
}

/// 重量单位。重量始终以 kg 存储，单位只影响显示与输入换算。
enum WeightUnit: String, Codable, Hashable, CaseIterable, Identifiable {
    case kg, lb

    var id: Self { self }
}

/// 进入备份的偏好设置（`preferences`）。
struct AppPreferences: Codable, Hashable {
    /// 用户是否显式选择过单位；nil 表示未设置（合并导入时可采用备份中的值）。
    var weightUnitSetting: WeightUnit?
    /// 每日热量目标，0–10000 kcal，0 表示未设置。
    var calorieGoal: Int = 0
    /// 每日蛋白质目标，0–1000 g，0 表示未设置。
    var proteinGoal: Int = 0

    static let calorieGoalRange = 0...10000
    static let proteinGoalRange = 0...1000

    init(weightUnit: WeightUnit? = nil, calorieGoal: Int = 0, proteinGoal: Int = 0) {
        weightUnitSetting = weightUnit
        self.calorieGoal = calorieGoal
        self.proteinGoal = proteinGoal
    }

    /// 生效的重量单位（未设置时为 kg）。
    var weightUnit: WeightUnit {
        get { weightUnitSetting ?? .kg }
        set { weightUnitSetting = newValue }
    }
    var calorieGoalValue: Int? { calorieGoal > 0 ? calorieGoal : nil }
    var proteinGoalValue: Int? { proteinGoal > 0 ? proteinGoal : nil }
    var isValid: Bool { Self.calorieGoalRange.contains(calorieGoal) && Self.proteinGoalRange.contains(proteinGoal) }

    enum CodingKeys: String, CodingKey {
        case weightUnitSetting = "weightUnit"
        case calorieGoal, proteinGoal
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        weightUnitSetting = (try? container.decodeIfPresent(WeightUnit.self, forKey: .weightUnitSetting)) ?? nil
        let calories = ((try? container.decodeIfPresent(Int.self, forKey: .calorieGoal)) ?? nil) ?? 0
        let protein = ((try? container.decodeIfPresent(Int.self, forKey: .proteinGoal)) ?? nil) ?? 0
        calorieGoal = min(max(calories, 0), Self.calorieGoalRange.upperBound)
        proteinGoal = min(max(protein, 0), Self.proteinGoalRange.upperBound)
    }
}

struct BuiltinExercise: Hashable {
    let id: String
    let name: String
    let muscle: String
    let equipment: String
}

/// 内置动作目录与规范 ID（docs/data-contract.md §2）。
enum BuiltinExerciseCatalog {
    /// 最初 30 个内置动作，ID 固定为英文 slug。
    static let starter: [BuiltinExercise] = [
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
    ].map { BuiltinExercise(id: $0.0, name: $0.1, muscle: $0.2, equipment: $0.3) }

    /// 名称 → 规范 ID：最初 30 个用 slug，目录扩展用 `builtin:<id>`。
    static let canonicalIdsByName: [String: String] = {
        var map: [String: String] = [:]
        for entry in starter { map[entry.name] = entry.id }
        for entry in ExtraExercise.catalog where map[entry.name] == nil { map[entry.name] = "builtin:\(entry.id)" }
        return map
    }()

    static func canonicalId(forName name: String) -> String? { canonicalIdsByName[name] }
}

extension AppState {
    /// 把名称属于内置目录的非自定义动作改为规范 ID，同步改写计划条目和组次引用，并合并同名内置动作。
    /// 自定义动作即使与内置动作同名也不改 ID。返回实际发生的 旧 ID → 新 ID 映射。
    @discardableResult
    mutating func normalizeExerciseIds() -> [String: String] {
        let canonical = BuiltinExerciseCatalog.canonicalIdsByName
        func target(_ exercise: Exercise) -> String? { exercise.isCustom ? nil : canonical[exercise.name] }
        // 被自定义或目录外动作占用的规范 ID 不能再分配，避免把两个不同动作并成一个。
        let blocked = Set(exercises.filter { target($0) == nil }.map(\.id))
        var remap: [String: String] = [:]
        var kept = Set<String>()
        var normalized: [Exercise] = []
        var changed = false
        for exercise in exercises {
            if let id = target(exercise), !blocked.contains(id) {
                if id != exercise.id { remap[exercise.id] = id; changed = true }
                guard kept.insert(id).inserted else { changed = true; continue }
                var copy = exercise
                copy.id = id
                normalized.append(copy)
            } else {
                kept.insert(exercise.id)
                normalized.append(exercise)
            }
        }
        guard changed else { return [:] }
        exercises = normalized
        guard !remap.isEmpty else { return remap }
        for planIndex in plans.indices {
            for itemIndex in plans[planIndex].items.indices {
                let id = plans[planIndex].items[itemIndex].exerciseId
                if let mapped = remap[id] { plans[planIndex].items[itemIndex].exerciseId = mapped }
            }
        }
        for workoutIndex in workouts.indices {
            for setIndex in workouts[workoutIndex].sets.indices {
                let id = workouts[workoutIndex].sets[setIndex].exerciseId
                if let mapped = remap[id] { workouts[workoutIndex].sets[setIndex].exerciseId = mapped }
            }
        }
        return remap
    }
}
