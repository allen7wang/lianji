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
