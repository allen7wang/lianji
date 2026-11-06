import SwiftUI

struct PlanFavoriteButton: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var saveFailed = false
    let plan: Plan

    var body: some View {
        let favorite = store.isPlanFavorite(plan.id)
        Button {
            do { try store.togglePlanFavorite(plan.id) }
            catch { saveFailed = true }
        } label: {
            Image(systemName: favorite ? "star.fill" : "star")
        }
        .buttonStyle(.bordered)
        .accessibilityLabel("\(favorite ? "取消收藏" : "收藏")\(plan.name)")
        .accessibilityValue(favorite ? "已收藏" : "未收藏")
        .help(favorite ? "取消收藏" : "收藏计划")
        .alert("无法保存收藏", isPresented: $saveFailed) {
            Button("好", role: .cancel) {}
        } message: {
            Text("请重试。")
        }
    }
}

struct DuplicatePlanButton: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var confirming = false
    @State private var feedback: String?
    let plan: Plan

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button("复制计划", systemImage: "doc.on.doc") { confirming = true }
                .buttonStyle(.bordered)
                .confirmationDialog("复制这份训练计划？", isPresented: $confirming, titleVisibility: .visible) {
                    Button("复制计划") {
                        do {
                            let copy = try store.duplicatePlan(plan.id)
                            feedback = "已创建「\(copy.name)」"
                        } catch {
                            feedback = "无法复制训练计划，请重试。"
                        }
                    }
                    Button("取消", role: .cancel) {}
                } message: {
                    Text(plan.name)
                }
            if let feedback {
                Text(feedback).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}
