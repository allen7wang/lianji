import SwiftUI
import Combine

struct BreathGuideRequest: Identifiable {
    var id = UUID()
    let profile: BreathingProfile
    let seconds: Int
}

struct BreathingGuideView: View {
    let profile: BreathingProfile
    let seconds: Int
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var session = BreathingSession()
    @State private var clock = Date.distantPast
    private let ticker = Timer.publish(every: 0.1, on: .main, in: .common).autoconnect()
    private let accent = Color(red: 0.725, green: 0.953, blue: 0.416)
    private var elapsed: Double { min(Double(seconds), session.elapsed(at: clock) / 1000) }
    private var finished: Bool { elapsed >= Double(seconds) }
    private var running: Bool { session.startedAt != nil && !finished }
    #if os(watchOS)
    private let diameter = 126.0
    #else
    private let diameter = 220.0
    #endif

    var body: some View {
        let phase = profile.phase(at: elapsed)
        VStack(alignment: .leading, spacing: 14) {
            Text(profile.name).font(.title3.bold())
            Text(profile.rhythmLabel).font(.caption).foregroundStyle(accent)
            ZStack {
                Circle().fill(accent.opacity(0.15))
                    .overlay(Circle().stroke(accent, lineWidth: 2))
                    .scaleEffect(reduceMotion ? 1 : finished ? 0.6 : phase.scale)
                    .accessibilityHidden(true)
                VStack(spacing: 6) {
                    Text(finished ? "引导完成" : running ? phase.label : session.elapsedMs > 0 ? "已暂停" : "准备开始").font(.headline)
                    Text(finished ? "✓" : running ? "\(phase.secondsRemaining)" : "—").font(.largeTitle.bold()).foregroundStyle(accent)
                }
            }.frame(width: diameter, height: diameter).frame(maxWidth: .infinity)
            Text("剩余 \(max(0, Int(ceil(Double(seconds) - elapsed)))) 秒 · 已完成 \(phase.completedCycles) 个循环").font(.caption)
            Text(profile.instruction).font(.caption).foregroundStyle(.secondary)
            Text("轻柔呼吸。头晕或胸闷时停止，恢复自然呼吸。切到后台会暂停引导。").font(.caption2).foregroundStyle(.secondary)
            if finished {
                Text("引导结束，返回后按实际完成情况勾选本组。").font(.caption).foregroundStyle(accent)
            } else {
                Button(running ? "暂停引导" : session.elapsedMs > 0 ? "继续引导" : "开始引导") {
                    clock = .now
                    if running { session.pause(at: clock) } else { session.resume(at: clock) }
                }.buttonStyle(.borderedProminent)
            }
            Button("重新开始") { session = BreathingSession(); clock = .distantPast }
        }
        .onReceive(ticker) { now in if session.startedAt != nil && !finished { clock = now } }
        .onChange(of: scenePhase) { if scenePhase != .active { clock = .now; session.pause(at: clock) } }
        .onDisappear { session.pause(at: .now) }
    }
}

#if os(macOS)
struct MacBreathingGuideSheet: View {
    let request: BreathGuideRequest
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                HStack { Text("呼吸引导").font(.headline); Spacer(); Button("关闭引导") { dismiss() } }
                BreathingGuideView(profile: request.profile, seconds: request.seconds)
            }.padding(24)
        }.frame(width: 520, height: 620)
    }
}
#endif
