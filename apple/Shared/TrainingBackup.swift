import Foundation

struct TrainingBackupPreview: Equatable {
    var exportedAt: Date
    var plans: Int
    var finishedWorkouts: Int
    var bodyEntries: Int
    var foodEntries: Int
    var hasWeeklyGoal: Bool

    var message: String {
        let date = exportedAt.formatted(date: .abbreviated, time: .omitted)
        return "备份导出于 \(date)，包含 \(plans) 个计划、\(finishedWorkouts) 次已完成训练、\(bodyEntries) 条身体记录和 \(foodEntries) 条饮食记录。恢复会用备份替换本机当前全部数据，且不可撤销。"
    }
}

struct TrainingBackupFile {
    var state: AppState
    var preview: TrainingBackupPreview
}

enum TrainingBackupError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let text): text
        }
    }
}

enum TrainingBackup {
    static let version = 1

    static func encode(_ state: AppState, exportedAt: Date = .now) throws -> Data {
        let exercises = state.exercises.map { exercise in
            [
                "id": exercise.id,
                "name": exercise.name,
                "muscle": exercise.muscle,
                "equipment": exercise.equipment,
                "isCustom": exercise.isCustom ? 1 : 0,
            ] as [String: Any]
        }
        let plans = state.plans.map { plan in
            [
                "id": plan.id,
                "name": plan.name,
                "note": plan.note,
                "createdAt": isoString(plan.createdAt),
            ] as [String: Any]
        }
        let planItems = state.plans.flatMap { plan in
            plan.items.enumerated().map { index, item in
                [
                    "id": item.id,
                    "planId": plan.id,
                    "exerciseId": item.exerciseId,
                    "sortOrder": index,
                    "sets": item.sets,
                    "reps": item.reps,
                    "weight": item.weight,
                    "unit": (item.unit ?? .reps).rawValue,
                    "restSeconds": item.restSeconds ?? 90,
                ] as [String: Any]
            }
        }
        let workouts = state.workouts.map { workout in
            [
                "id": workout.id,
                "planId": workout.planId ?? NSNull(),
                "name": workout.name,
                "startedAt": isoString(workout.startedAt),
                "endedAt": workout.endedAt.map(isoString) ?? NSNull(),
                "note": workout.note,
            ] as [String: Any]
        }
        let sets = state.workouts.flatMap { workout in
            workout.sets.enumerated().map { index, set in
                [
                    "id": set.id,
                    "workoutId": workout.id,
                    "exerciseId": set.exerciseId,
                    "sortOrder": index,
                    "setNumber": set.setNumber,
                    "weight": set.weight,
                    "reps": set.reps,
                    "completed": set.completed ? 1 : 0,
                    "unit": (set.unit ?? .reps).rawValue,
                    "restSeconds": set.restSeconds ?? 90,
                ] as [String: Any]
            }
        }
        let body = state.bodyEntries.map { entry in
            [
                "id": entry.id,
                "recordedAt": isoString(entry.recordedAt),
                "weight": entry.weight,
                "bodyFat": entry.bodyFat ?? NSNull(),
            ] as [String: Any]
        }
        let food = state.foodEntries.map { entry in
            [
                "id": entry.id,
                "loggedAt": isoString(entry.loggedAt),
                "meal": entry.meal,
                "name": entry.name,
                "portion": entry.portion,
                "calories": entry.calories,
                "protein": entry.protein,
                "carbs": entry.carbs,
                "fat": entry.fat,
            ] as [String: Any]
        }
        let schedule = (state.trainingSchedule ?? []).sorted {
            $0.day == $1.day ? $0.planId < $1.planId : $0.day < $1.day
        }.map { ["day": $0.day, "planId": $0.planId] as [String: Any] }
        let planIds = Set(state.plans.map(\.id))
        let favorites = Set(state.favoritePlanIds ?? []).filter { planIds.contains($0) }.sorted()
        let object: [String: Any] = [
            "app": "lianji",
            "version": version,
            "exportedAt": isoString(exportedAt),
            "tables": [
                "exercises": exercises,
                "plans": plans,
                "plan_items": planItems,
                "workouts": workouts,
                "workout_sets": sets,
                "body_entries": body,
                "food_entries": food,
            ],
            "weeklyGoal": state.weeklyGoalDays ?? 0,
            "schedule": schedule,
            "favoritePlanIds": favorites,
        ]
        guard JSONSerialization.isValidJSONObject(object) else {
            throw TrainingBackupError.message("备份内容已损坏：无法导出。")
        }
        return try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }

    static func filename(exportedAt: Date) -> String {
        "lianji-backup-\(isoString(exportedAt).prefix(10))"
    }

    static func parse(_ data: Data) throws -> TrainingBackupFile {
        let root: NSDictionary
        do {
            guard let object = try JSONSerialization.jsonObject(with: data) as? NSDictionary else {
                throw TrainingBackupError.message("这不是练迹的备份文件。")
            }
            root = object
        } catch let error as TrainingBackupError {
            throw error
        } catch {
            throw TrainingBackupError.message("备份文件不是有效的 JSON。")
        }
        guard root["app"] as? String == "lianji", root["tables"] is NSDictionary else {
            throw TrainingBackupError.message("这不是练迹的备份文件。")
        }
        guard let fileVersion = integer(root["version"]), fileVersion == version else {
            let shown = root["version"].map { "\($0)" } ?? "未知"
            throw TrainingBackupError.message("备份版本（\(shown)）与当前应用（\(version)）不兼容。")
        }
        let tables = root["tables"] as! NSDictionary
        let exerciseRows = try rows(tables, "exercises")
        let planRows = try rows(tables, "plans")
        let itemRows = try rows(tables, "plan_items")
        let workoutRows = try rows(tables, "workouts")
        let setRows = try rows(tables, "workout_sets")
        let bodyRows = try rows(tables, "body_entries")
        let foodRows = try rows(tables, "food_entries")
        let hasWeeklyGoal = root["weeklyGoal"] != nil
        if hasWeeklyGoal, integer(root["weeklyGoal"]).map({ (0...7).contains($0) }) != true {
            throw TrainingBackupError.message("备份中的每周训练目标无效。")
        }
        let planIds = Set(try planRows.map { try identifier($0) })
        let schedule = try scheduleEntries(root["schedule"], planIds: planIds)
        let favorites = try favoritePlanIds(root["favoritePlanIds"], planIds: planIds)

        let exercises = try exerciseRows.map { row -> Exercise in
            Exercise(
                id: try identifier(row),
                name: try text(row, "name"),
                muscle: try text(row, "muscle"),
                equipment: try text(row, "equipment"),
                isCustom: try flag(row, "isCustom")
            )
        }
        let exerciseIds = Set(exercises.map(\.id))
        var itemsByPlan: [String: [(Int, Int, PlanItem)]] = [:]
        for (offset, row) in itemRows.enumerated() {
            let planId = try text(row, "planId")
            let exerciseId = try text(row, "exerciseId")
            guard planIds.contains(planId), exerciseIds.contains(exerciseId) else {
                throw TrainingBackupError.message("备份内容已损坏：计划动作引用了不存在的计划或动作。")
            }
            let item = PlanItem(
                id: try identifier(row),
                exerciseId: exerciseId,
                sets: try integer(row, "sets"),
                reps: try integer(row, "reps"),
                weight: try number(row, "weight"),
                unit: try unit(row["unit"]),
                restSeconds: try optionalInteger(row["restSeconds"])
            )
            itemsByPlan[planId, default: []].append((try integer(row, "sortOrder"), offset, item))
        }
        let plans = try planRows.map { row -> Plan in
            let id = try identifier(row)
            let items = (itemsByPlan[id] ?? []).sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }.map(\.2)
            return Plan(id: id, name: try text(row, "name"), note: try text(row, "note"), createdAt: try date(row, "createdAt"), items: items)
        }
        let workoutIds = Set(try workoutRows.map { try identifier($0) })
        var setsByWorkout: [String: [(Int, Int, TrainingSet)]] = [:]
        for (offset, row) in setRows.enumerated() {
            let workoutId = try text(row, "workoutId")
            let exerciseId = try text(row, "exerciseId")
            guard workoutIds.contains(workoutId), exerciseIds.contains(exerciseId) else {
                throw TrainingBackupError.message("备份内容已损坏：训练组引用了不存在的训练或动作。")
            }
            let set = TrainingSet(
                id: try identifier(row),
                exerciseId: exerciseId,
                setNumber: try integer(row, "setNumber"),
                weight: try number(row, "weight"),
                reps: try integer(row, "reps"),
                completed: try flag(row, "completed"),
                unit: try unit(row["unit"]),
                restSeconds: try optionalInteger(row["restSeconds"])
            )
            setsByWorkout[workoutId, default: []].append((try integer(row, "sortOrder"), offset, set))
        }
        let workouts = try workoutRows.map { row -> Workout in
            let id = try identifier(row)
            let planId = try optionalText(row["planId"])
            if let planId, !planIds.contains(planId) {
                throw TrainingBackupError.message("备份内容已损坏：训练记录引用了不存在的计划。")
            }
            return Workout(
                id: id,
                planId: planId,
                name: try text(row, "name"),
                startedAt: try date(row, "startedAt"),
                endedAt: try optionalDate(row["endedAt"]),
                note: try text(row, "note"),
                sets: (setsByWorkout[id] ?? []).sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }.map(\.2)
            )
        }
        let bodyEntries = try bodyRows.map { row in
            BodyEntry(id: try identifier(row), recordedAt: try date(row, "recordedAt"), weight: try number(row, "weight"), bodyFat: try optionalNumber(row["bodyFat"]))
        }
        let foodEntries = try foodRows.map { row in
            FoodEntry(
                id: try identifier(row),
                loggedAt: try date(row, "loggedAt"),
                meal: try text(row, "meal"),
                name: try text(row, "name"),
                portion: try text(row, "portion"),
                calories: try number(row, "calories"),
                protein: try number(row, "protein"),
                carbs: try number(row, "carbs"),
                fat: try number(row, "fat")
            )
        }
        let goal = hasWeeklyGoal ? integer(root["weeklyGoal"]) : nil
        let state = AppState(
            exercises: exercises,
            plans: plans,
            workouts: workouts,
            bodyEntries: bodyEntries,
            foodEntries: foodEntries,
            weeklyGoalDays: goal == 0 ? nil : goal,
            trainingSchedule: schedule,
            favoritePlanIds: favorites
        )
        let preview = TrainingBackupPreview(
            exportedAt: try date(root, "exportedAt"),
            plans: plans.count,
            finishedWorkouts: workouts.filter { $0.endedAt != nil }.count,
            bodyEntries: bodyEntries.count,
            foodEntries: foodEntries.count,
            hasWeeklyGoal: hasWeeklyGoal
        )
        return TrainingBackupFile(state: state, preview: preview)
    }

    private static func rows(_ tables: NSDictionary, _ name: String) throws -> [NSDictionary] {
        guard let list = tables[name] as? NSArray else {
            throw TrainingBackupError.message("备份缺少 \(name) 数据。")
        }
        var seen = Set<String>()
        return try list.map { value in
            guard let row = value as? NSDictionary else {
                throw TrainingBackupError.message("备份内容已损坏：存在缺少 id 的记录。")
            }
            let id = try identifier(row)
            guard seen.insert(id).inserted else {
                throw TrainingBackupError.message("备份内容已损坏：存在重复 id。")
            }
            return row
        }
    }

    private static func scheduleEntries(_ value: Any?, planIds: Set<String>) throws -> [ScheduledTraining]? {
        if value == nil { return nil }
        guard let list = value as? NSArray else {
            throw TrainingBackupError.message("备份中的训练日程无效。")
        }
        var seen = Set<String>()
        return try list.map { entry in
            guard let row = entry as? NSDictionary, let day = row["day"] as? String, isScheduleDay(day),
                  let planId = row["planId"] as? String, planIds.contains(planId) else {
                throw TrainingBackupError.message("备份中的训练日程包含无效日期或找不到对应计划。")
            }
            guard seen.insert("\(day)/\(planId)").inserted else {
                throw TrainingBackupError.message("备份中有重复的训练日程。")
            }
            return ScheduledTraining(planId: planId, day: day)
        }
    }

    private static func favoritePlanIds(_ value: Any?, planIds: Set<String>) throws -> [String]? {
        if value == nil { return nil }
        guard let list = value as? [String] else {
            throw TrainingBackupError.message("备份中的收藏计划无效。")
        }
        var seen = Set<String>()
        for id in list {
            guard !id.isEmpty, planIds.contains(id) else {
                throw TrainingBackupError.message("备份中的收藏计划不存在。")
            }
            guard seen.insert(id).inserted else {
                throw TrainingBackupError.message("备份中有重复的收藏计划。")
            }
        }
        return list
    }

    private static func isScheduleDay(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil, !value.hasPrefix("0000-") else { return false }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)
        guard let date = calendar.date(from: components) else { return false }
        let back = calendar.dateComponents([.year, .month, .day], from: date)
        return back.year == parts[0] && back.month == parts[1] && back.day == parts[2]
    }

    private static func identifier(_ row: NSDictionary) throws -> String {
        guard let id = row["id"] as? String, !id.isEmpty else {
            throw TrainingBackupError.message("备份内容已损坏：存在缺少 id 的记录。")
        }
        return id
    }

    private static func text(_ row: NSDictionary, _ key: String) throws -> String {
        guard let value = row[key] as? String else {
            throw TrainingBackupError.message("备份内容已损坏：\(key) 无效。")
        }
        return value
    }

    private static func optionalText(_ value: Any?) throws -> String? {
        if value == nil || value is NSNull { return nil }
        guard let text = value as? String, !text.isEmpty else {
            throw TrainingBackupError.message("备份内容已损坏：存在无效引用。")
        }
        return text
    }

    private static func integer(_ row: NSDictionary, _ key: String) throws -> Int {
        guard let value = integer(row[key]) else {
            throw TrainingBackupError.message("备份内容已损坏：\(key) 无效。")
        }
        return value
    }

    private static func optionalInteger(_ value: Any?) throws -> Int? {
        if value == nil || value is NSNull { return nil }
        guard let number = integer(value) else {
            throw TrainingBackupError.message("备份内容已损坏：数字无效。")
        }
        return number
    }

    private static func number(_ row: NSDictionary, _ key: String) throws -> Double {
        guard let value = finiteNumber(row[key]) else {
            throw TrainingBackupError.message("备份内容已损坏：\(key) 无效。")
        }
        return value
    }

    private static func optionalNumber(_ value: Any?) throws -> Double? {
        if value == nil || value is NSNull { return nil }
        guard let number = finiteNumber(value) else {
            throw TrainingBackupError.message("备份内容已损坏：数字无效。")
        }
        return number
    }

    private static func flag(_ row: NSDictionary, _ key: String) throws -> Bool {
        guard let number = row[key] as? NSNumber else {
            throw TrainingBackupError.message("备份内容已损坏：\(key) 无效。")
        }
        if CFGetTypeID(number) == CFBooleanGetTypeID() { return number.boolValue }
        guard let value = integer(number), value == 0 || value == 1 else {
            throw TrainingBackupError.message("备份内容已损坏：\(key) 无效。")
        }
        return value == 1
    }

    private static func unit(_ value: Any?) throws -> TrainingUnit? {
        if value == nil || value is NSNull { return nil }
        guard let text = value as? String, let unit = TrainingUnit(rawValue: text) else {
            throw TrainingBackupError.message("备份内容已损坏：计次单位无效。")
        }
        return unit
    }

    private static func date(_ row: NSDictionary, _ key: String) throws -> Date {
        guard let value = parsedDate(row[key]) else {
            throw TrainingBackupError.message("备份内容已损坏：日期无效。")
        }
        return value
    }

    private static func optionalDate(_ value: Any?) throws -> Date? {
        if value == nil || value is NSNull { return nil }
        guard let date = parsedDate(value) else {
            throw TrainingBackupError.message("备份内容已损坏：日期无效。")
        }
        return date
    }

    private static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let double = number.doubleValue
        guard double.isFinite, double.rounded() == double, double >= Double(Int.min), double <= Double(Int.max) else { return nil }
        return number.intValue
    }

    private static func finiteNumber(_ value: Any?) -> Double? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        let double = number.doubleValue
        return double.isFinite ? double : nil
    }

    private static func parsedDate(_ value: Any?) -> Date? {
        guard let text = value as? String else { return nil }
        return fractionalISO.date(from: text) ?? plainISO.date(from: text)
    }

    private static func isoString(_ date: Date) -> String {
        fractionalISO.string(from: date)
    }

    private static let fractionalISO: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()

    private static let plainISO: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()
}
