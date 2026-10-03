import SwiftUI
import ImageIO

struct ExerciseDemo: Codable, Identifiable {
    let id: String
    let name: String
    let mediaId: String?
    let gifUrl: String?
    let asset: String?
    let source: String
    let sourceUrl: String?
    let license: String?
    let licenseUrl: String?
    let caption: String

    static let catalog: [ExerciseDemo] = {
        guard let url = Bundle.main.url(forResource: "exercise-demos", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let entries = try? JSONDecoder().decode([ExerciseDemo].self, from: data) else { return [] }
        return entries
    }()

    static func find(_ exercise: Exercise) -> ExerciseDemo? {
        exercise.isCustom ? nil : catalog.first { $0.name == exercise.name }
    }
}

private struct AnimationFrames {
    let images: [CGImage]
    let startTimes: [Double]
    let duration: Double

    func image(at time: Double) -> CGImage {
        let position = time.truncatingRemainder(dividingBy: duration)
        let index = startTimes.lastIndex { $0 <= position } ?? 0
        return images[index]
    }
}

private enum DemoLoadError: Error {
    case invalidImage, invalidResponse, tooLarge
}

private enum DemoLoader {
    static func load(_ demo: ExerciseDemo) async throws -> AnimationFrames {
        let data: Data
        if let asset = demo.asset, let url = Bundle.main.url(forResource: asset, withExtension: nil) {
            data = try Data(contentsOf: url)
        } else if let source = demo.gifUrl, let url = URL(string: source) {
            let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("ExerciseDemos", isDirectory: true)
            let cacheURL = directory.appendingPathComponent("\(demo.id)-\(demo.mediaId ?? "v1").gif")
            if let cached = try? Data(contentsOf: cacheURL) {
                if let frames = try? await Task.detached(priority: .userInitiated, operation: { try decode(cached) }).value {
                    return frames
                }
                // A failed cache must not prevent retrying the network source.
                try? FileManager.default.removeItem(at: cacheURL)
            }
            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            let (download, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw DemoLoadError.invalidResponse }
            guard download.count <= 5_000_000 else { throw DemoLoadError.tooLarge }
            let frames = try await Task.detached(priority: .userInitiated) { try decode(download) }.value
            // Cache only after every sampled frame has been decoded successfully.
            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try? download.write(to: cacheURL, options: .atomic)
            return frames
        } else { throw DemoLoadError.invalidImage }
        return try await Task.detached(priority: .userInitiated) { try decode(data) }.value
    }

    private static func decode(_ data: Data) throws -> AnimationFrames {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { throw DemoLoadError.invalidImage }
        let count = CGImageSourceGetCount(source)
        guard count > 0, count <= 500 else { throw DemoLoadError.invalidImage }
        #if os(watchOS)
        let maxFrames = 24
        let maxPixelSize = 220
        #else
        let maxFrames = 72
        let maxPixelSize = 640
        #endif
        let stride = max(1, Int(ceil(Double(count) / Double(maxFrames))))
        var images: [CGImage] = []
        var startTimes: [Double] = []
        var elapsed = 0.0
        for index in 0..<count {
            try Task.checkCancellation()
            let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any]
            let gif = properties?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
            let delay = max(0.02, (gif?[kCGImagePropertyGIFUnclampedDelayTime] as? Double) ?? (gif?[kCGImagePropertyGIFDelayTime] as? Double) ?? 0.12)
            if index % stride == 0 {
                let options: [CFString: Any] = [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceShouldCacheImmediately: true
                ]
                guard let image = CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary) else { throw DemoLoadError.invalidImage }
                images.append(image)
                startTimes.append(elapsed)
            }
            elapsed += delay
        }
        return AnimationFrames(images: images, startTimes: startTimes, duration: max(elapsed, 0.12))
    }
}

struct ExerciseDemoView: View {
    let exercise: Exercise
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var frames: AnimationFrames?
    @State private var failed = false
    @State private var playing = true
    @State private var visible = false
    @State private var attempt = 0
    @State private var startedAt = Date.now
    @State private var pausedTime = 0.0

    private var demo: ExerciseDemo? { ExerciseDemo.find(exercise) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(exercise.name).font(.title3.bold())
                Text("\(exercise.muscle) · \(exercise.equipment)").font(.caption).foregroundStyle(.secondary)
                if let demo {
                    if let frames {
                        TimelineView(.animation(minimumInterval: 1.0 / 12.0, paused: !playing || !visible || scenePhase != .active)) { context in
                            Image(decorative: frames.image(at: playing ? max(0, context.date.timeIntervalSince(startedAt)) : pausedTime), scale: 1)
                                .resizable().scaledToFit()
                                .accessibilityLabel("\(exercise.name)动作演示")
                        }
                        .frame(maxWidth: .infinity)
                        .background(.white, in: RoundedRectangle(cornerRadius: 14))
                        Button(playing ? "暂停动图" : "播放动图", systemImage: playing ? "pause.circle" : "play.circle") {
                            if playing { pausedTime = max(0, Date.now.timeIntervalSince(startedAt)) }
                            else { startedAt = .now.addingTimeInterval(-pausedTime) }
                            playing.toggle()
                        }
                    } else if failed {
                        Text("动图加载失败，检查网络后重试").font(.caption)
                        Button("重新加载", systemImage: "arrow.clockwise") { attempt += 1 }
                    } else {
                        ProgressView("加载动图…").frame(maxWidth: .infinity, minHeight: 120)
                    }
                    Text(demo.caption).font(.caption).foregroundStyle(.secondary)
                    Text("素材：\(demo.source)").font(.caption2).foregroundStyle(.secondary)
                    if let source = demo.sourceUrl, let url = URL(string: source) { Link("查看来源", destination: url).font(.caption2) }
                    if let license = demo.license, let source = demo.licenseUrl, let url = URL(string: source) { Link(license, destination: url).font(.caption2) }
                } else {
                    Text("此自定义动作还没有配置动图").foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("动作演示")
        .onAppear { visible = true; playing = !reduceMotion }
        .onDisappear { visible = false }
        .task(id: attempt) {
            guard let demo else { return }
            failed = false
            do {
                let loaded = try await DemoLoader.load(demo)
                try Task.checkCancellation()
                frames = loaded
                startedAt = .now
            } catch {
                if !Task.isCancelled { failed = true }
            }
        }
    }
}

#if os(macOS)
struct MacExerciseDemoSheet: View {
    let exercise: Exercise
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(spacing: 0) {
            HStack { Text("动作演示").font(.headline); Spacer(); Button("关闭") { dismiss() } }.padding()
            ExerciseDemoView(exercise: exercise)
        }
        .frame(width: 520, height: 620)
    }
}
#endif
