import SwiftUI
import UniformTypeIdentifiers

#if !os(watchOS)
struct BackupFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data

    init(data: Data = Data()) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
#endif

struct TrainingBackupActions: View {
    @EnvironmentObject private var store: TrainingStore
    @State private var filename = "lianji-backup"
    @State private var pending: Data?
    @State private var confirm = false
    @State private var confirmText = ""
    @State private var notice: String?
    #if os(watchOS)
    @State private var exportURL: URL?
    #else
    @State private var importing = false
    @State private var exporting = false
    @State private var document = BackupFileDocument()
    #endif

    var body: some View {
        #if os(watchOS)
        actions
            .alert("备份", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
                Button("好", role: .cancel) {}
            } message: {
                Text(notice ?? "")
            }
        #else
        actions
            .alert("备份", isPresented: Binding(get: { notice != nil }, set: { if !$0 { notice = nil } })) {
                Button("好", role: .cancel) {}
            } message: {
                Text(notice ?? "")
            }
            .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: filename) { result in
                if case .failure(let error) = result, !Self.isCancellation(error) { notice = "导出失败，请重试。" }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                loadImport(result)
            }
            .alert("恢复备份", isPresented: $confirm) {
                Button("取消", role: .cancel) { pending = nil }
                Button("替换并恢复", role: .destructive, action: applyImport)
            } message: {
                Text(confirmText)
            }
        #endif
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("备份保存在「文件」").font(.headline)
            Text(exportCopy)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            exportControl
            #if !os(watchOS)
            Button("从备份恢复") { importing = true }
            #endif
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var exportCopy: String {
        #if os(watchOS)
        "导出全部计划、训练、身体和饮食数据。点「准备备份」后，用系统分享保存 JSON。手表不能选文件恢复，可在 iPhone、Android 或 Mac 上恢复这份备份。"
        #else
        "导出全部计划、训练、身体和饮食数据。同一份 JSON 可以在 iPhone、Android 和 Mac 上手动恢复，也可以恢复 Apple Watch 分享出来的备份。恢复会替换本机当前数据，各端不会自动同步。"
        #endif
    }

    @ViewBuilder private var exportControl: some View {
        #if os(watchOS)
        Button("准备备份", action: beginExport)
        if let exportURL {
            ShareLink(item: exportURL) {
                Label("分享备份文件", systemImage: "square.and.arrow.up")
            }
        }
        #else
        Button("导出备份", action: beginExport)
        #endif
    }

    private func beginExport() {
        do {
            let exportedAt = Date.now
            let data = try store.exportBackup(exportedAt: exportedAt)
            filename = TrainingBackup.filename(exportedAt: exportedAt)
            #if os(watchOS)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(filename).json")
            try data.write(to: url, options: .atomic)
            exportURL = url
            #else
            document = BackupFileDocument(data: data)
            exporting = true
            #endif
        } catch {
            notice = error.localizedDescription
        }
    }

    #if !os(watchOS)
    private func loadImport(_ result: Result<URL, Error>) {
        do {
            let url = try result.get()
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            let data = try Data(contentsOf: url)
            confirmText = try TrainingBackup.parse(data).preview.message
            pending = data
            confirm = true
        } catch {
            if !Self.isCancellation(error) { notice = error.localizedDescription }
        }
    }

    private func applyImport() {
        guard let pending else { return }
        self.pending = nil
        do {
            _ = try store.restoreBackup(pending)
            notice = "练迹数据已从备份恢复。"
        } catch {
            notice = error.localizedDescription
        }
    }
    #endif

    private static func isCancellation(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSCocoaErrorDomain && nsError.code == NSUserCancelledError
    }
}
