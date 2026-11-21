import SwiftUI
#if os(macOS)
import AppKit
#endif

// 练迹设计语言「迹线」（v3.0）。数值与 docs/design-system.md、src/ui/theme.ts 保持一致。
// macOS 跟随系统明暗；watchOS 固定使用深色值。

enum Theme {
    enum Colors {
        /// 页面底色
        static let bg = dynamic(light: 0xF4F2EE, dark: 0x0E0E0F)
        /// 卡片
        static let surface = dynamic(light: 0xFFFFFF, dark: 0x18181A)
        /// 分段控件选中块、浮层
        static let raised = dynamic(light: 0xFFFFFF, dark: 0x2C2C30)
        /// 输入框、标签、次要按钮填充
        static let surfaceAlt = dynamic(light: 0xECE9E3, dark: 0x232326)
        /// 细线、卡片描边
        static let border = dynamic(light: 0xE3DFD8, dark: 0x2A2A2E)
        /// 主文字
        static let text = dynamic(light: 0x151515, dark: 0xF4F2EE)
        /// 次要文字
        static let textMuted = dynamic(light: 0x6B675F, dark: 0xA39E95)
        /// 占位、禁用（仅非关键信息）
        static let textFaint = dynamic(light: 0x9C978E, dark: 0x6C6862)
        /// 主按钮、进行中状态
        static let accent = dynamic(light: 0xFF5A1F, dark: 0xFF6B35)
        /// 橙色上的文字与图标
        static let onAccent = dynamic(light: 0x151515, dark: 0x151515)
        /// 橙色浅底
        static let accentSoft = dynamic(light: 0xFFE7DC, dark: 0x33190D)
        /// 页面底色上的橙色文字、文字按钮
        static let accentText = dynamic(light: 0xC2410C, dark: 0xFF8A5C)
        /// 图表、统计
        static let data = dynamic(light: 0x3557F0, dark: 0x8197FF)
        /// 图表浅底
        static let dataSoft = dynamic(light: 0xE5EAFF, dark: 0x1B2142)
        /// 已完成
        static let success = dynamic(light: 0x12805A, dark: 0x3DD68C)
        /// 绿色上的图标
        static let onSuccess = dynamic(light: 0xFFFFFF, dark: 0x0E0E0F)
        /// 已完成行底色
        static let successSoft = dynamic(light: 0xDCF2E8, dark: 0x10281C)
        /// 热身组、提醒
        static let warning = dynamic(light: 0xA86500, dark: 0xF5B544)
        /// 热身组底色
        static let warningSoft = dynamic(light: 0xFBEFD9, dark: 0x33260C)
        /// 删除、错误
        static let danger = dynamic(light: 0xC93636, dark: 0xFF6B6B)
        /// 危险操作底色
        static let dangerSoft = dynamic(light: 0xFBE3E3, dark: 0x3A1616)
        /// 选中标签底色
        static let inverse = dynamic(light: 0x151515, dark: 0xF4F2EE)
        /// 选中标签文字
        static let onInverse = dynamic(light: 0xF4F2EE, dark: 0x151515)
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 28
        static let xxxl: CGFloat = 40
        /// 页面左右边距
        static let page: CGFloat = 20
        /// 区块之间
        static let section: CGFloat = 28
        /// 卡片内边距
        static let cardPadding: CGFloat = 18
        /// 卡片之间
        static let cardGap: CGFloat = 12
    }

    enum Radius {
        /// 组次输入、小标签
        static let sm: CGFloat = 10
        /// 输入框、小按钮
        static let md: CGFloat = 14
        /// 卡片
        static let lg: CGFloat = 20
        /// 首屏主卡
        static let xl: CGFloat = 28
        /// 按钮、标签（胶囊）
        static let pill: CGFloat = 999
        /// 小标记
        static let tag: CGFloat = 6
    }

    /// 细线宽
    static let hairline: CGFloat = 1
    /// 最小可点区域
    static let minTouchTarget: CGFloat = 44

    enum Fonts {
        static var display: Font { .theme(.display) }
        static var title1: Font { .theme(.title1) }
        static var title2: Font { .theme(.title2) }
        static var title3: Font { .theme(.title3) }
        static var number: Font { .theme(.number) }
        static var body: Font { .theme(.body) }
        static var bodyStrong: Font { .theme(.bodyStrong) }
        static var caption: Font { .theme(.caption) }
        static var overline: Font { .theme(.overline) }
    }

    fileprivate static func dynamic(light: UInt32, dark: UInt32) -> Color {
        #if os(macOS)
        return Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? nsColor(dark) : nsColor(light)
        })
        #else
        return color(dark)
        #endif
    }

    fileprivate static func components(_ hex: UInt32) -> (red: Double, green: Double, blue: Double) {
        (Double((hex >> 16) & 0xFF) / 255, Double((hex >> 8) & 0xFF) / 255, Double(hex & 0xFF) / 255)
    }

    fileprivate static func color(_ hex: UInt32) -> Color {
        let value = components(hex)
        return Color(.sRGB, red: value.red, green: value.green, blue: value.blue, opacity: 1)
    }

    #if os(macOS)
    fileprivate static func nsColor(_ hex: UInt32) -> NSColor {
        let value = components(hex)
        return NSColor(srgbRed: value.red, green: value.green, blue: value.blue, alpha: 1)
    }
    #endif
}

// MARK: - 字体

/// 字体令牌。所有令牌都使用等宽数字。
enum ThemeTextStyle: CaseIterable {
    case display, title1, title2, title3, number, body, bodyStrong, caption, overline

    /// 字号：watchOS 整体缩小（display 36、title1 22、title3 16、body 15、caption 12）。
    var size: CGFloat {
        #if os(watchOS)
        switch self {
        case .display: 36
        case .title1: 22
        case .title2: 19
        case .title3: 16
        case .number: 20
        case .body, .bodyStrong: 15
        case .caption: 12
        case .overline: 11
        }
        #else
        switch self {
        case .display: 44
        case .title1: 30
        case .title2: 22
        case .title3: 17
        case .number: 22
        case .body, .bodyStrong: 15
        case .caption: 13
        case .overline: 11
        }
        #endif
    }

    /// 设计稿行高（按设计稿字号比例换算到当前平台字号）。
    var lineHeight: CGFloat {
        let ratio: CGFloat
        switch self {
        case .display: ratio = 48.0 / 44
        case .title1: ratio = 36.0 / 30
        case .title2: ratio = 28.0 / 22
        case .title3: ratio = 22.0 / 17
        case .number: ratio = 26.0 / 22
        case .body, .bodyStrong: ratio = 22.0 / 15
        case .caption: ratio = 18.0 / 13
        case .overline: ratio = 14.0 / 11
        }
        return (size * ratio).rounded()
    }

    var weight: Font.Weight {
        switch self {
        case .display, .title1, .number, .overline: .heavy
        case .title2, .title3, .bodyStrong: .bold
        case .body, .caption: .medium
        }
    }

    var tracking: CGFloat {
        switch self {
        case .display: -1.2
        case .title1: -0.6
        case .title2: -0.3
        case .number: -0.4
        case .overline: 1.4
        case .title3, .body, .bodyStrong, .caption: 0
        }
    }

    var font: Font { .system(size: size, weight: weight).monospacedDigit() }
}

extension Font {
    static func theme(_ style: ThemeTextStyle) -> Font { style.font }
}

extension View {
    /// 应用字体令牌：字号、字重、字距、行距与等宽数字；`overline` 自动大写。
    func themeText(_ style: ThemeTextStyle) -> some View {
        font(style.font)
            .tracking(style.tracking)
            .lineSpacing(max(0, style.lineHeight - style.size * 1.2))
            .textCase(style == .overline ? .uppercase : nil)
    }

    /// 卡片：`surface` 底、1 px `border`、圆角 `lg`、内边距 18。
    func themeCard(padding: CGFloat = Theme.Spacing.cardPadding, radius: CGFloat = Theme.Radius.lg) -> some View {
        modifier(ThemeCardModifier(padding: padding, radius: radius))
    }
}

struct ThemeCardModifier: ViewModifier {
    var padding: CGFloat = Theme.Spacing.cardPadding
    var radius: CGFloat = Theme.Radius.lg

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Colors.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Theme.Colors.border, lineWidth: Theme.hairline))
    }
}

// MARK: - 信号卡

/// `accent` 底、`onAccent` 文字、圆角 `xl`。每屏最多一张（今日训练、进行中训练、休息计时）。
struct SignalCard<Content: View>: View {
    var padding: CGFloat = Theme.Spacing.xl
    @ViewBuilder var content: Content

    var body: some View {
        content
            .foregroundStyle(Theme.Colors.onAccent)
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Colors.accent, in: RoundedRectangle(cornerRadius: Theme.Radius.xl, style: .continuous))
    }
}

// MARK: - 按钮

enum ThemeButtonSize {
    /// 高 52、字号 16
    case regular
    /// 高 40、字号 14
    case small

    var height: CGFloat { self == .regular ? 52 : 40 }
    var fontSize: CGFloat { self == .regular ? 16 : 14 }
    var horizontalPadding: CGFloat { self == .regular ? 24 : 16 }
}

/// 胶囊按钮的共同外观；按下时轻微变暗（未开启「减少动态效果」时附带缩放）。
private struct ThemeCapsuleButton: View {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let configuration: ButtonStyleConfiguration
    let size: ThemeButtonSize
    let fill: Color
    let foreground: Color
    let fullWidth: Bool

    var body: some View {
        configuration.label
            .font(.system(size: size.fontSize, weight: .bold).monospacedDigit())
            .lineLimit(1)
            .foregroundStyle(foreground)
            .padding(.horizontal, size.horizontalPadding)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: size.height)
            .background(fill, in: Capsule())
            .contentShape(Capsule())
            .opacity(isEnabled ? (configuration.isPressed ? 0.82 : 1) : 0.4)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// 主按钮：`accent` 底、`onAccent` 文字。
struct ThemePrimaryButtonStyle: ButtonStyle {
    var size: ThemeButtonSize = .regular
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        ThemeCapsuleButton(configuration: configuration, size: size, fill: Theme.Colors.accent, foreground: Theme.Colors.onAccent, fullWidth: fullWidth)
    }
}

/// 次要按钮：`surfaceAlt` 底、`text` 文字。
struct ThemeSecondaryButtonStyle: ButtonStyle {
    var size: ThemeButtonSize = .regular
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        ThemeCapsuleButton(configuration: configuration, size: size, fill: Theme.Colors.surfaceAlt, foreground: Theme.Colors.text, fullWidth: fullWidth)
    }
}

/// 危险按钮：`dangerSoft` 底、`danger` 文字。
struct ThemeDangerButtonStyle: ButtonStyle {
    var size: ThemeButtonSize = .regular
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        ThemeCapsuleButton(configuration: configuration, size: size, fill: Theme.Colors.dangerSoft, foreground: Theme.Colors.danger, fullWidth: fullWidth)
    }
}

/// 文字按钮：透明底、`accentText` 文字（`bodyStrong`）。
struct ThemeTextButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        ThemeTextButton(configuration: configuration)
    }

    private struct ThemeTextButton: View {
        @Environment(\.isEnabled) private var isEnabled
        let configuration: ButtonStyleConfiguration

        var body: some View {
            configuration.label
                .font(ThemeTextStyle.bodyStrong.font)
                .foregroundStyle(Theme.Colors.accentText)
                .frame(minHeight: Theme.minTouchTarget)
                .contentShape(Rectangle())
                .opacity(isEnabled ? (configuration.isPressed ? 0.6 : 1) : 0.4)
        }
    }
}

/// 图标按钮：40 × 40 圆形、`surfaceAlt` 底、20 号图标。请为按钮提供无障碍标签。
struct ThemeIconButtonStyle: ButtonStyle {
    var diameter: CGFloat = 40

    func makeBody(configuration: Configuration) -> some View {
        ThemeIconButton(configuration: configuration, diameter: diameter)
    }

    private struct ThemeIconButton: View {
        @Environment(\.isEnabled) private var isEnabled
        let configuration: ButtonStyleConfiguration
        let diameter: CGFloat

        var body: some View {
            configuration.label
                .font(.system(size: 20, weight: .semibold))
                .labelStyle(.iconOnly)
                .foregroundStyle(Theme.Colors.text)
                .frame(width: diameter, height: diameter)
                .background(Theme.Colors.surfaceAlt, in: Circle())
                .contentShape(Circle())
                .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
        }
    }
}

extension ButtonStyle where Self == ThemePrimaryButtonStyle {
    static var themePrimary: Self { .init() }
    static func themePrimary(_ size: ThemeButtonSize, fullWidth: Bool = false) -> Self { .init(size: size, fullWidth: fullWidth) }
}

extension ButtonStyle where Self == ThemeSecondaryButtonStyle {
    static var themeSecondary: Self { .init() }
    static func themeSecondary(_ size: ThemeButtonSize, fullWidth: Bool = false) -> Self { .init(size: size, fullWidth: fullWidth) }
}

extension ButtonStyle where Self == ThemeDangerButtonStyle {
    static var themeDanger: Self { .init() }
    static func themeDanger(_ size: ThemeButtonSize, fullWidth: Bool = false) -> Self { .init(size: size, fullWidth: fullWidth) }
}

extension ButtonStyle where Self == ThemeTextButtonStyle {
    static var themeText: Self { .init() }
}

extension ButtonStyle where Self == ThemeIconButtonStyle {
    static var themeIcon: Self { .init() }
}

// MARK: - 标签（筛选 chip）

/// 高 34、胶囊、`surfaceAlt` 底、`textMuted` 字；选中 `inverse` 底 + `onInverse` 字。
struct ThemeChip: View {
    let title: String
    var systemImage: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Theme.Spacing.xs) {
                if let systemImage { Image(systemName: systemImage).accessibilityHidden(true) }
                Text(title).lineLimit(1)
            }
            .font(.system(size: 13, weight: .bold).monospacedDigit())
            .foregroundStyle(isSelected ? Theme.Colors.onInverse : Theme.Colors.textMuted)
            .padding(.horizontal, 14)
            .frame(minHeight: 34)
            .background(isSelected ? Theme.Colors.inverse : Theme.Colors.surfaceAlt, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - 统计

/// `number` 数字 + `caption` 单位与说明。
struct ThemeStat: View {
    let value: String
    var unit: String? = nil
    var caption: String? = nil
    var tint: Color = Theme.Colors.text

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).themeText(.number).foregroundStyle(tint)
                if let unit {
                    Text(unit).themeText(.caption).foregroundStyle(Theme.Colors.textMuted)
                }
            }
            if let caption {
                Text(caption).themeText(.caption).foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - 迹线进度

/// 高 6 胶囊轨道（`surfaceAlt`）；填充：进行中 `accent`、已完成 `success`、统计 `data`。
struct TraceProgress: View {
    enum Tone {
        case active, complete, data

        var color: Color {
            switch self {
            case .active: Theme.Colors.accent
            case .complete: Theme.Colors.success
            case .data: Theme.Colors.data
            }
        }
    }

    /// 0–1，超出范围会被截断。
    let value: Double
    var tone: Tone = .active
    var height: CGFloat = 6
    /// 无障碍标签，例如「已完成组」。
    var label: String = "进度"

    private var fraction: Double { value.isFinite ? min(max(value, 0), 1) : 0 }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.Colors.surfaceAlt)
                Capsule().fill(tone.color)
                    .frame(width: fraction > 0 ? max(height, proxy.size.width * fraction) : 0)
            }
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityValue("\(Int((fraction * 100).rounded()))%")
    }
}

// MARK: - 小标记

/// 高 22、圆角 6、11 / 700；橙 / 绿 / 蓝 / 黄四种浅底配深字（另有中性灰）。
struct ThemeTag: View {
    enum Tone {
        case accent, success, data, warning, neutral

        var foreground: Color {
            switch self {
            case .accent: Theme.Colors.accentText
            case .success: Theme.Colors.success
            case .data: Theme.Colors.data
            case .warning: Theme.Colors.warning
            case .neutral: Theme.Colors.textMuted
            }
        }

        var background: Color {
            switch self {
            case .accent: Theme.Colors.accentSoft
            case .success: Theme.Colors.successSoft
            case .data: Theme.Colors.dataSoft
            case .warning: Theme.Colors.warningSoft
            case .neutral: Theme.Colors.surfaceAlt
            }
        }
    }

    let text: String
    var tone: Tone = .accent
    var systemImage: String? = nil

    var body: some View {
        HStack(spacing: 3) {
            if let systemImage { Image(systemName: systemImage).accessibilityHidden(true) }
            Text(text).lineLimit(1)
        }
        .font(.system(size: 11, weight: .bold).monospacedDigit())
        .foregroundStyle(tone.foreground)
        .padding(.horizontal, 7)
        .frame(height: 22)
        .background(tone.background, in: RoundedRectangle(cornerRadius: Theme.Radius.tag, style: .continuous))
    }
}

// MARK: - 页面头、区块标题、空状态

/// 眉题（`overline`，`textMuted`）+ 标题（`title1`）；右侧可放图标按钮。
struct ThemePageHeader<Trailing: View>: View {
    let overline: String
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .bottom, spacing: Theme.Spacing.md) {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                Text(overline).themeText(.overline).foregroundStyle(Theme.Colors.textMuted)
                Text(title).themeText(.title1).foregroundStyle(Theme.Colors.text)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            trailing
        }
    }
}

extension ThemePageHeader where Trailing == EmptyView {
    init(overline: String, title: String) {
        self.init(overline: overline, title: title) { EmptyView() }
    }
}

/// `title2` + 右侧文字操作（`bodyStrong`，`accentText`）。
struct ThemeSectionHeader: View {
    let title: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).themeText(.title2).foregroundStyle(Theme.Colors.text)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Theme.Spacing.sm)
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.themeText)
            }
        }
    }
}

/// 56 圆形 `surfaceAlt` 图标底 + `title3` + `caption`。
struct ThemeEmptyState: View {
    let systemImage: String
    let title: String
    var message: String? = nil

    var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: systemImage)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(Theme.Colors.textMuted)
                .frame(width: 56, height: 56)
                .background(Theme.Colors.surfaceAlt, in: Circle())
                .accessibilityHidden(true)
            Text(title).themeText(.title3).foregroundStyle(Theme.Colors.text)
            if let message {
                Text(message).themeText(.caption).foregroundStyle(Theme.Colors.textMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.xl)
        .accessibilityElement(children: .combine)
    }
}
