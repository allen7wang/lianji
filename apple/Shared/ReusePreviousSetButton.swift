import SwiftUI

struct ReusePreviousSetButton: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var failure: String?
    let workoutId: String
    let setId: String
    let source: PreviousSetReference

    var body: some View {
        Button("沿用上次第 \(source.set.setNumber) 组 · \(valueLabel)", systemImage: "arrow.down.doc") {
            do { try store.reusePreviousSet(workoutId: workoutId, setId: setId, source: source) }
            catch let error as ReusePreviousSetError { failure = error.localizedDescription }
            catch { failure = "保存失败，请重试。" }
        }
        .font(.caption)
        .buttonStyle(.bordered)
        .alert("无法沿用上次组次", isPresented: Binding(
            get: { failure != nil },
            set: { if !$0 { failure = nil } }
        )) {
            Button("好", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }

    private var valueLabel: String {
        let set = source.set
        if set.unit == .seconds {
            return set.weight > 0 ? "\(set.weight.formatted()) kg · \(set.targetLabel)" : set.targetLabel
        }
        return "\(set.weight.formatted()) kg × \(set.targetLabel)"
    }
}
