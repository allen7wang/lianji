import Foundation

struct NutritionDay: Equatable, Identifiable {
    var day: String
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    var id: String { day }
}

struct BodyTrendPoint: Equatable, Identifiable {
    var id: String
    var recordedAt: Date
    var weight: Double
    var bodyFat: Double?
}

struct BodyTrend: Equatable {
    var points: [BodyTrendPoint]
    var latest: BodyTrendPoint?
    var previous: BodyTrendPoint?
    var weightDelta: Double?
    var fatPoints: [BodyTrendPoint]
}

enum WellnessTrend {
    static func bodyTrend(_ entries: [BodyEntry], limit: Int = 8) -> BodyTrend {
        let sorted = entries.sorted { lhs, rhs in
            if lhs.recordedAt != rhs.recordedAt { return lhs.recordedAt < rhs.recordedAt }
            return lhs.id < rhs.id
        }
        let latest = sorted.last.map(point)
        let previous = sorted.dropLast().last.map(point)
        let points = sorted.suffix(max(limit, 0)).map(point)
        return BodyTrend(
            points: points,
            latest: latest,
            previous: previous,
            weightDelta: latest.flatMap { current in previous.map { current.weight - $0.weight } },
            fatPoints: sorted.filter { $0.bodyFat != nil }.suffix(max(limit, 0)).map(point)
        )
    }

    static func nutritionTrend(_ entries: [FoodEntry], limit: Int = 7, timeZone: TimeZone = .current) -> [NutritionDay] {
        var totals: [String: (calories: Double, protein: Double, carbs: Double, fat: Double)] = [:]
        for entry in entries {
            let day = ScheduledTraining.localDay(entry.loggedAt, timeZone: timeZone)
            let current = totals[day] ?? (0, 0, 0, 0)
            totals[day] = (
                current.calories + entry.calories,
                current.protein + entry.protein,
                current.carbs + entry.carbs,
                current.fat + entry.fat
            )
        }
        let days = totals.map { day, sums in
            NutritionDay(
                day: day,
                calories: roundedTenth(sums.calories),
                protein: roundedTenth(sums.protein),
                carbs: roundedTenth(sums.carbs),
                fat: roundedTenth(sums.fat)
            )
        }.sorted { $0.day < $1.day }
        return Array(days.suffix(max(limit, 0)))
    }

    private static func point(_ entry: BodyEntry) -> BodyTrendPoint {
        BodyTrendPoint(id: entry.id, recordedAt: entry.recordedAt, weight: entry.weight, bodyFat: entry.bodyFat)
    }

    private static func roundedTenth(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }
}

// MARK: - 每日营养 vs 目标

struct NutritionGoalProgress: Equatable {
    var day: String
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    /// 目标为 0（未设置）时为 nil。
    var calorieGoal: Int?
    var proteinGoal: Int?

    /// 完成比例（未截断，可能 > 1）；未设置目标时为 nil。
    var calorieProgress: Double? { calorieGoal.map { calories / Double($0) } }
    var proteinProgress: Double? { proteinGoal.map { protein / Double($0) } }
    /// 剩余量（超出时为负数）；未设置目标时为 nil。
    var remainingCalories: Double? { calorieGoal.map { Double($0) - calories } }
    var remainingProtein: Double? { proteinGoal.map { Double($0) - protein } }
}

extension WellnessTrend {
    /// 某个本地日的营养合计（保留一位小数）与目标对照。
    static func dailyNutrition(_ entries: [FoodEntry], on date: Date, preferences: AppPreferences, timeZone: TimeZone = .current) -> NutritionGoalProgress {
        let day = ScheduledTraining.localDay(date, timeZone: timeZone)
        var sums = (calories: 0.0, protein: 0.0, carbs: 0.0, fat: 0.0)
        for entry in entries where ScheduledTraining.localDay(entry.loggedAt, timeZone: timeZone) == day {
            sums.calories += entry.calories
            sums.protein += entry.protein
            sums.carbs += entry.carbs
            sums.fat += entry.fat
        }
        func tenth(_ value: Double) -> Double { (value * 10).rounded() / 10 }
        return NutritionGoalProgress(
            day: day,
            calories: tenth(sums.calories),
            protein: tenth(sums.protein),
            carbs: tenth(sums.carbs),
            fat: tenth(sums.fat),
            calorieGoal: preferences.calorieGoalValue,
            proteinGoal: preferences.proteinGoalValue
        )
    }
}

// MARK: - 饮食快速添加

/// 由历史饮食记录得到的可复用条目（按 名称 + 份量 去重，数值取最近一次）。
struct FoodTemplate: Identifiable, Hashable {
    var name: String
    var portion: String
    var calories: Double
    var protein: Double
    var carbs: Double
    var fat: Double
    /// 最近一次记录所在的餐次。
    var lastMeal: String
    var lastLoggedAt: Date
    /// 历史记录次数。
    var count: Int

    var id: String { FoodQuickAdd.key(name: name, portion: portion) }

    func makeEntry(meal: String, loggedAt: Date = .now) -> FoodEntry {
        FoodEntry(loggedAt: loggedAt, meal: meal, name: name, portion: portion, calories: calories, protein: protein, carbs: carbs, fat: fat)
    }
}

enum FoodQuickAdd {
    static let defaultLimit = 8

    static func key(name: String, portion: String) -> String {
        "\(name.trimmingCharacters(in: .whitespacesAndNewlines))\u{1F}\(portion.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    /// 最近吃过的：去重后按最近一次时间倒序，最多 `limit` 条。
    static func recent(_ entries: [FoodEntry], limit: Int = defaultLimit) -> [FoodTemplate] {
        Array(templates(entries).prefix(max(limit, 0)))
    }

    /// 常吃的：按记录次数倒序，次数相同按最近一次时间倒序，最多 `limit` 条。
    static func frequent(_ entries: [FoodEntry], limit: Int = defaultLimit) -> [FoodTemplate] {
        let sorted = templates(entries).enumerated().sorted { lhs, rhs in
            lhs.element.count != rhs.element.count ? lhs.element.count > rhs.element.count : lhs.offset < rhs.offset
        }.map(\.element)
        return Array(sorted.prefix(max(limit, 0)))
    }

    /// 全部去重条目，最近一次时间倒序。
    static func templates(_ entries: [FoodEntry]) -> [FoodTemplate] {
        let ordered = entries.sorted { lhs, rhs in
            lhs.loggedAt != rhs.loggedAt ? lhs.loggedAt > rhs.loggedAt : lhs.id > rhs.id
        }
        var result: [FoodTemplate] = []
        var indexByKey: [String: Int] = [:]
        for entry in ordered {
            let name = entry.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { continue }
            let key = key(name: name, portion: entry.portion)
            if let index = indexByKey[key] {
                result[index].count += 1
                continue
            }
            indexByKey[key] = result.count
            result.append(FoodTemplate(
                name: name,
                portion: entry.portion.trimmingCharacters(in: .whitespacesAndNewlines),
                calories: entry.calories,
                protein: entry.protein,
                carbs: entry.carbs,
                fat: entry.fat,
                lastMeal: entry.meal,
                lastLoggedAt: entry.loggedAt,
                count: 1
            ))
        }
        return result
    }
}
