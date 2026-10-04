import Foundation

struct ProgramExercise: Codable, Hashable {
    var name: String
    var sets: Int
    var reps: Int
    var unit: TrainingUnit?
    var restSeconds: Int?
    var targetLabel: String {
        let actualUnit = unit ?? (name == "平板支撑" ? .seconds : .reps)
        return "\(reps) \(actualUnit == .seconds ? "秒" : "次")"
    }
}

struct ProgramDay: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var focus: String
    var exercises: [ProgramExercise]
}

struct TrainingProgram: Identifiable, Codable, Hashable {
    var id: String
    var name: String
    var subtitle: String
    var description: String
    var category: String
    var level: String
    var frequency: String
    var equipment: [String]
    var guidance: [String]
    var sport: String?
    var days: [ProgramDay]

    static var categories: [String] {
        ["全部"] + catalog.reduce(into: [String]()) { result, program in
            if !result.contains(program.category) { result.append(program.category) }
        }
    }
    static var sports: [String] {
        ["全部项目"] + catalog.reduce(into: [String]()) { result, program in
            if let sport = program.sport, !result.contains(sport) { result.append(sport) }
        }
    }

    static let catalog: [TrainingProgram] = {
        guard let url = Bundle.main.url(forResource: "training-programs", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let programs = try? JSONDecoder().decode([TrainingProgram].self, from: data) else { return [] }
        return programs
    }()

    func planId(_ day: ProgramDay) -> String { "template:\(id):\(day.id)" }
    func missingDays(in plans: [Plan]) -> Int {
        days.filter { day in !plans.contains { $0.id == planId(day) } }.count
    }

    func makePlans(exercises: [Exercise]) throws -> [Plan] {
        try days.map { day in
            let items = try day.exercises.map { item in
                guard let exercise = exercises.first(where: { !$0.isCustom && $0.name == item.name }) else {
                    throw ProgramImportError.missingExercise(item.name)
                }
                return PlanItem(exerciseId: exercise.id, sets: item.sets, reps: item.reps, weight: 0, unit: item.unit ?? exercise.defaultUnit, restSeconds: item.restSeconds ?? 90)
            }
            return Plan(id: planId(day), name: "\(name) · \(day.name)",
                        note: "\(day.focus)。\(frequency) \(guidance.joined(separator: " "))" + (category == "呼吸训练" ? "" : " 单侧动作按每侧记录。重量请按实际填写。"), items: items)
        }
    }
}

private enum ProgramImportError: LocalizedError {
    case missingExercise(String)
    var errorDescription: String? {
        switch self {
        case .missingExercise(let name): return "动作库缺少“\(name)”，未添加这套计划。"
        }
    }
}
