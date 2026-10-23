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
    let mediaKind: String?
    let referenceUrl: String?
    let caption: String

    static let catalog: [ExerciseDemo] = {
        guard let url = Bundle.main.url(forResource: "exercise-demos", withExtension: "json") else {
            print("Missing bundled exercise-demos.json")
            return []
        }
        do {
            return try JSONDecoder().decode([ExerciseDemo].self, from: Data(contentsOf: url))
        } catch {
            print("Could not decode exercise-demos.json: \(error)")
            return []
        }
    }()

    var hasLocalMedia: Bool { asset?.isEmpty == false }
    var mediaLabel: String {
        if hasLocalMedia {
            let isReal = mediaKind.map { $0 == "real" } ?? source.contains("wger")
            return isReal ? "离线真人" : "离线示意"
        }
        return gifUrl?.isEmpty == false ? "联网动图" : "离线呼吸"
    }

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
        if demo.hasLocalMedia {
            guard let asset = demo.asset, let url = Bundle.main.url(forResource: asset, withExtension: nil) else { throw DemoLoadError.invalidImage }
            data = try Data(contentsOf: url)
        } else if let source = demo.gifUrl, !source.isEmpty, let url = URL(string: source) {
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
    @State private var playback = BreathingSession()

    private var demo: ExerciseDemo? { ExerciseDemo.find(exercise) }
    private var canAnimate: Bool { frames != nil && playing && visible && scenePhase == .active }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(exercise.name).font(.title3.bold())
                Text("\(exercise.muscle) · \(exercise.equipment)").font(.caption).foregroundStyle(.secondary)
                if let demo { Text(demo.mediaLabel).font(.caption2.bold()).foregroundStyle(.green) }
                if let breathing = BreathingProfile.find(exercise) {
                    BreathingGuideView(profile: breathing, seconds: breathing.id == "box_breathing" ? 64 : 60)
                } else if let demo {
                    if let frames {
                        TimelineView(.animation(minimumInterval: 1.0 / 12.0, paused: !canAnimate)) { context in
                            Image(decorative: frames.image(at: playback.elapsed(at: context.date) / 1000), scale: 1)
                                .resizable().scaledToFit()
                                .accessibilityLabel("\(exercise.name)动作演示")
                        }
                        .frame(maxWidth: .infinity)
                        .background(.white, in: RoundedRectangle(cornerRadius: 14))
                        Button(playing ? "暂停动图" : "播放动图", systemImage: playing ? "pause.circle" : "play.circle") { playing.toggle() }
                    } else if failed {
                        Text(demo.hasLocalMedia ? "本地动图未能打开，可重试或查看下方动作步骤" : "联网动图未能加载，可先查看下方动作步骤").font(.caption)
                        Button("重新加载", systemImage: "arrow.clockwise") { attempt += 1 }
                    } else {
                        ProgressView("加载动图…").frame(maxWidth: .infinity, minHeight: 120)
                    }
                    Text(demo.caption).font(.caption).foregroundStyle(.secondary)
                    Text(demo.hasLocalMedia ? "随应用提供，无需联网。可暂停观察动作。" : "首次查看需要联网，加载后缓存；无网络时仍可查看动作说明。").font(.caption2).foregroundStyle(.secondary)
                } else {
                    Text("此自定义动作还没有配置动图").foregroundStyle(.secondary)
                }
                if let guide = ExerciseGuide.find(exercise) { ExerciseGuideContent(guide: guide) }
                if let demo {
                    Divider()
                    Text("素材：\(demo.source)").font(.caption2).foregroundStyle(.secondary)
                    if let reference = demo.referenceUrl, !reference.isEmpty, let url = URL(string: reference) { Link("联网模型参考（需联网）", destination: url).font(.caption2) }
                    if let source = demo.sourceUrl, !source.isEmpty, let url = URL(string: source) { Link("查看来源", destination: url).font(.caption2) }
                    if let license = demo.license, let source = demo.licenseUrl, !source.isEmpty, let url = URL(string: source) { Link(license, destination: url).font(.caption2) }
                }
            }
            .padding()
        }
        .navigationTitle("动作演示")
        .onAppear { visible = true; playing = !reduceMotion }
        .onDisappear { playback.pause(at: .now); visible = false }
        .onChange(of: canAnimate) { _, running in
            if running { playback.resume(at: .now) }
            else { playback.pause(at: .now) }
        }
        .onChange(of: reduceMotion) { _, reduced in if reduced { playing = false } }
        .task(id: attempt) {
            guard BreathingProfile.find(exercise) == nil, let demo else { return }
            failed = false
            do {
                let loaded = try await DemoLoader.load(demo)
                try Task.checkCancellation()
                playback = BreathingSession()
                frames = loaded
            } catch {
                if !Task.isCancelled { failed = true }
            }
        }
    }
}

private struct ExerciseGuideContent: View {
    let guide: ExerciseGuide
    @State private var showCues = false
    @State private var showMistakes = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
            Text("动作步骤").font(.headline)
            ForEach(Array(guide.steps.enumerated()), id: \.offset) { step in
                HStack(alignment: .top, spacing: 8) {
                    Text("\(step.offset + 1)").font(.caption.bold()).foregroundStyle(.green)
                    Text(step.element).font(.caption).fixedSize(horizontal: false, vertical: true)
                }
            }
            Button("动作要点", systemImage: showCues ? "chevron.up" : "chevron.down") { showCues.toggle() }
                .accessibilityValue(showCues ? "已展开" : "已折叠")
            if showCues {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(guide.cues, id: \.self) { Text("• \($0)").font(.caption).fixedSize(horizontal: false, vertical: true) }
                }
            }
            Button("常见错误", systemImage: showMistakes ? "chevron.up" : "chevron.down") { showMistakes.toggle() }
                .accessibilityValue(showMistakes ? "已展开" : "已折叠")
            if showMistakes {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(guide.mistakes, id: \.self) { Text("• \($0)").font(.caption).fixedSize(horizontal: false, vertical: true) }
                }
            }
            Text("演示仅供动作参考，不代表适合所有人的负重或幅度。不适时停止练习，先确保动作可控。")
                .font(.caption2).foregroundStyle(.secondary)
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
