import Foundation

struct ExerciseGuide: Decodable, Identifiable {
    let id: String
    let steps: [String]
    let cues: [String]
    let mistakes: [String]

    static let catalog: [ExerciseGuide] = {
        guard let url = Bundle.main.url(forResource: "exercise-guides", withExtension: "json") else {
            print("Missing bundled exercise-guides.json")
            return []
        }
        do {
            return try JSONDecoder().decode([ExerciseGuide].self, from: Data(contentsOf: url))
        } catch {
            print("Could not decode exercise-guides.json: \(error)")
            return []
        }
    }()

    static func find(_ exercise: Exercise) -> ExerciseGuide? {
        guard let demo = ExerciseDemo.find(exercise) else { return nil }
        return catalog.first { $0.id == demo.id }
    }
}
