import SwiftUI

struct PreviousExerciseSetsView: View {
    let reference: PreviousExerciseSets

    var body: some View {
        ComparisonDisclosure {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(reference.sets) { set in
                    Text("第 \(set.setNumber) 组 · \(setLabel(set))").font(.caption)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(reference.unit == .seconds ? "上次组次 · 时长" : "上次组次 · 次数").font(.caption.bold())
                Text("\(reference.workout.startedAt.formatted(date: .abbreviated, time: .shortened)) · \(reference.workout.name)")
                    .font(.caption2).foregroundStyle(.secondary)
                if let last = reference.sets.last {
                    Text("\(reference.sets.count) 组 · 末组 \(setLabel(last))")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func setLabel(_ set: TrainingSet) -> String {
        set.unit == .seconds ? set.targetLabel : "\(set.weight.formatted()) kg × \(set.targetLabel)"
    }
}

struct PlanWorkoutComparisonView: View {
    let comparison: PlanWorkoutComparison

    var body: some View {
        let previous = comparison.previous
        let current = comparison.current
        ComparisonDisclosure {
            VStack(alignment: .leading, spacing: 4) {
                Text("上次 → 本次").foregroundStyle(.secondary)
                Text("完成组 \(previous.completedSets) → \(current.completedSets)")
                if previous.volume > 0 || current.volume > 0 {
                    Text("容量 \(number(previous.volume)) → \(number(current.volume)) kg × 次")
                }
                if previous.timedSeconds > 0 || current.timedSeconds > 0 {
                    Text("计时 \(number(previous.timedSeconds)) → \(number(current.timedSeconds)) 秒")
                }
            }
            .font(.caption)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 4)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text("同计划对照").font(.caption.bold())
                Text("\(comparison.workout.startedAt.formatted(date: .abbreviated, time: .shortened)) · \(comparison.workout.name)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func number(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)))
    }
}

private struct ComparisonDisclosure<Content: View, Label: View>: View {
    @State private var expanded = false
    @ViewBuilder var content: Content
    @ViewBuilder var label: Label

    var body: some View {
        #if os(watchOS)
        VStack(alignment: .leading, spacing: 6) {
            Button {
                expanded.toggle()
            } label: {
                HStack {
                    label
                    Spacer(minLength: 4)
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.caption2).accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(expanded ? "已展开" : "已折叠")
            if expanded { content }
        }
        #else
        DisclosureGroup(isExpanded: $expanded) { content } label: { label }
        #endif
    }
}
