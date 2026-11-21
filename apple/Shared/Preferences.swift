import Foundation

// MARK: - 重量单位换算

extension WeightUnit {
    /// 1 lb = 0.45359237 kg（精确定义）。
    static let kilogramsPerPound = 0.45359237

    var symbol: String { rawValue }
    var label: String {
        switch self {
        case .kg: "千克"
        case .lb: "磅"
        }
    }
    /// 步进按钮的默认步长（以本单位计）。
    var step: Double {
        switch self {
        case .kg: 2.5
        case .lb: 5
        }
    }

    /// kg → 本单位（不取整）。
    func fromKilograms(_ kilograms: Double) -> Double {
        switch self {
        case .kg: kilograms
        case .lb: kilograms / Self.kilogramsPerPound
        }
    }

    /// 本单位 → kg（不取整）。
    func toKilograms(_ value: Double) -> Double {
        switch self {
        case .kg: value
        case .lb: value * Self.kilogramsPerPound
        }
    }

    /// 显示用数值：kg 保留一位小数，lb 四舍五入到 0.5。
    func displayValue(kilograms: Double) -> Double {
        let value = fromKilograms(kilograms)
        switch self {
        case .kg: return (value * 10).rounded() / 10
        case .lb: return (value * 2).rounded() / 2
        }
    }

    /// 显示用文字，例如 `62.5 kg`、`135 lb`（去掉多余的 .0，不加千位分隔符）。
    func format(kilograms: Double, includeUnit: Bool = true) -> String {
        let text = Self.trimmed(displayValue(kilograms: kilograms))
        return includeUnit ? "\(text) \(symbol)" : text
    }

    /// 估算 1RM 显示：kg 四舍五入到 0.5，lb 四舍五入到 1。
    func formatEstimatedOneRepMax(kilograms: Double, includeUnit: Bool = true) -> String {
        let value = fromKilograms(kilograms)
        let rounded = self == .kg ? (value * 2).rounded() / 2 : value.rounded()
        let text = Self.trimmed(rounded)
        return includeUnit ? "\(text) \(symbol)" : text
    }

    /// 把用户以本单位输入的文字解析为 kg；接受 `,` 作为小数点。空白、负数或非数字返回 nil。
    func parseKilograms(_ text: String) -> Double? {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
            .replacingOccurrences(of: symbol, with: "", options: .caseInsensitive)
            .trimmingCharacters(in: .whitespaces)
        guard !cleaned.isEmpty, let value = Double(cleaned), value.isFinite, value >= 0 else { return nil }
        return toKilograms(value)
    }

    static func trimmed(_ value: Double) -> String {
        guard value.isFinite, value != 0 else { return "0" }
        let tenths = (value * 10).rounded()
        if tenths.truncatingRemainder(dividingBy: 10) == 0 {
            return String(format: "%.0f", tenths / 10)
        }
        return String(format: "%.1f", tenths / 10)
    }
}

// MARK: - 设备本地设置（不进入备份）

/// 休息通知、震动、健康同步等只属于这台设备的开关，保存在 UserDefaults。
/// SwiftUI 中可直接用 `@AppStorage(DeviceSettings.Key.haptics.rawValue)`，默认值见 `Key.defaultValue`。
struct DeviceSettings {
    enum Key: String, CaseIterable {
        case restNotifications = "device.restNotifications"
        case haptics = "device.haptics"
        case healthSync = "device.healthSync"

        var defaultValue: Bool {
            switch self {
            case .restNotifications, .haptics: true
            case .healthSync: false
            }
        }
    }

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func value(_ key: Key) -> Bool {
        defaults.object(forKey: key.rawValue) == nil ? key.defaultValue : defaults.bool(forKey: key.rawValue)
    }

    func set(_ value: Bool, for key: Key) {
        defaults.set(value, forKey: key.rawValue)
    }

    var restNotifications: Bool {
        get { value(.restNotifications) }
        nonmutating set { set(newValue, for: .restNotifications) }
    }
    var haptics: Bool {
        get { value(.haptics) }
        nonmutating set { set(newValue, for: .haptics) }
    }
    var healthSync: Bool {
        get { value(.healthSync) }
        nonmutating set { set(newValue, for: .healthSync) }
    }
}
