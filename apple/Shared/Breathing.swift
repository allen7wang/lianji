import Foundation

struct BreathingProfile: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let inhaleSeconds: Int
    let holdInSeconds: Int
    let exhaleSeconds: Int
    let holdOutSeconds: Int
    let instruction: String

    struct Phase {
        let label: String
        let seconds: Int
        let fromScale: Double
        let toScale: Double
    }
    var phases: [Phase] {
        [Phase(label: "吸气", seconds: inhaleSeconds, fromScale: 0.6, toScale: 1),
         Phase(label: "吸后停留", seconds: holdInSeconds, fromScale: 1, toScale: 1),
         Phase(label: "呼气", seconds: exhaleSeconds, fromScale: 1, toScale: 0.6),
         Phase(label: "呼后停留", seconds: holdOutSeconds, fromScale: 0.6, toScale: 0.6)].filter { $0.seconds > 0 }
    }
    var rhythmLabel: String { phases.map { "\($0.label) \($0.seconds) 秒" }.joined(separator: " · ") }
    var cycleSeconds: Int { phases.reduce(0) { $0 + $1.seconds } }
    func phase(at elapsedSeconds: Double) -> (label: String, secondsRemaining: Int, scale: Double, completedCycles: Int) {
        let elapsed = max(0, elapsedSeconds.isFinite ? elapsedSeconds : 0)
        var position = elapsed.truncatingRemainder(dividingBy: Double(cycleSeconds))
        for phase in phases {
            if position < Double(phase.seconds) {
                return (phase.label, Int(ceil(Double(phase.seconds) - position)),
                        phase.fromScale + (phase.toScale - phase.fromScale) * position / Double(phase.seconds),
                        Int(elapsed / Double(cycleSeconds)))
            }
            position -= Double(phase.seconds)
        }
        preconditionFailure("呼吸节奏未配置")
    }
    static let catalog: [BreathingProfile] = {
        guard let url = Bundle.main.url(forResource: "breathing-profiles", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let entries = try? JSONDecoder().decode([BreathingProfile].self, from: data) else { return [] }
        return entries
    }()
    static func find(_ exercise: Exercise?) -> BreathingProfile? {
        guard let exercise, !exercise.isCustom else { return nil }
        return catalog.first { $0.name == exercise.name }
    }
}

struct BreathingSession {
    var elapsedMs: Double = 0
    var startedAt: Date?
    func elapsed(at now: Date) -> Double { elapsedMs + (startedAt.map { max(0, now.timeIntervalSince($0) * 1000) } ?? 0) }
    mutating func resume(at now: Date) { if startedAt == nil { startedAt = now } }
    mutating func pause(at now: Date) { elapsedMs = elapsed(at: now); startedAt = nil }
}
