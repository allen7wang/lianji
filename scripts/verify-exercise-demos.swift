import Foundation
import ImageIO

@main
struct ExerciseDemoChecks {
    static func main() throws {
        func check(_ value: @autoclosure () -> Bool, _ message: String) {
            precondition(value(), message)
        }
        check(ExerciseDemo.catalog.count == 55, "Swift decodes the complete demo catalog")
        check(ExerciseGuide.catalog.count == 55, "Swift loads teaching for every built-in demo")
        check(Set(ExerciseGuide.catalog.map(\.id)) == Set(ExerciseDemo.catalog.map(\.id)), "teaching and media IDs agree")
        var localCount = 0
        for demo in ExerciseDemo.catalog {
            let exercise = Exercise(id: demo.id, name: demo.name, muscle: "", equipment: "", isCustom: false)
            check(demo.gifUrl?.isEmpty != false, "every built-in demonstration is offline")
            let expectedLabel = demo.mediaKind == "real" ? "离线真人" : demo.mediaKind == "illustration" ? "离线示意" : "离线呼吸"
            check(demo.mediaLabel == expectedLabel, "media labels follow the actual visual style, not the provider name")
            let guide = ExerciseGuide.find(exercise)!
            check(guide.steps.count == 3 && guide.cues.count == 2 && guide.mistakes.count == 2, "complete teaching sections")
            check(ExerciseGuide.find(Exercise(id: "custom", name: demo.name, muscle: "", equipment: "", isCustom: true)) == nil, "custom exercises never borrow instructions by name")
            guard let asset = demo.asset, !asset.isEmpty else { continue }
            localCount += 1
            let url = Bundle.main.url(forResource: asset, withExtension: nil)!
            let data = try Data(contentsOf: url)
            let source = CGImageSourceCreateWithData(data as CFData, nil)!
            let count = CGImageSourceGetCount(source)
            check(count > 1 && count <= 500, "animated GIF within decoder budget")
            for index in 0..<count {
                check(CGImageSourceCreateImageAtIndex(source, index, nil) != nil, "every GIF frame decodes with ImageIO")
            }
        }
        check(localCount == 51, "all 51 bundled GIFs resolve in the Apple bundle")
        // The same effective-time clock used by breathing and the GIF player must freeze in background.
        var playback = BreathingSession()
        playback.resume(at: Date(timeIntervalSince1970: 1))
        playback.pause(at: Date(timeIntervalSince1970: 2))
        check(playback.elapsed(at: Date(timeIntervalSince1970: 120)) == 1000, "background time excluded")
        playback.resume(at: Date(timeIntervalSince1970: 120))
        check(playback.elapsed(at: Date(timeIntervalSince1970: 121)) == 2000, "resume continues from the paused frame")
        print("Passed: Swift catalog / 55 guides / 51 local GIFs fully decoded / custom-name isolation / effective playback time.")
    }
}
