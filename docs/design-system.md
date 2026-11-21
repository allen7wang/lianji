# 练迹设计语言「迹线」（v3.0）

iOS、Android、Web、macOS 和 watchOS共用同一套设计令牌。手机端令牌在 `src/ui/theme.ts`，Apple 端在 `apple/Shared/Theme.swift`，数值必须一致。

## 原则

1. **数字是主角**：重量、次数、时长、容量用大号等宽数字；单位用小号次要色紧跟其后。
2. **一种强调色**：信号橙只表示「可以按的主操作」和「正在进行的状态」（进行中训练、计时）。完成用绿色，数据和图表用钴蓝，其余都是墨色和纸色。
3. **纸与墨**：浅色主题是暖白纸面，深色主题是深墨底；用细线分隔，不用重阴影。界面跟随系统明暗（watchOS 固定深色）。
4. **轨迹线**：进度条、图表折线、历史时间线都用 2–6 px 的细线和圆点，呼应「练迹」。
5. **触控可靠**：可点区域不小于 44 × 44；所有交互元素带无障碍标签；尊重「减少动态效果」。

## 颜色

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `bg` | `#F4F2EE` | `#0E0E0F` | 页面底色 |
| `surface` | `#FFFFFF` | `#18181A` | 卡片 |
| `raised` | `#FFFFFF` | `#2C2C30` | 分段控件选中块、浮层 |
| `surfaceAlt` | `#ECE9E3` | `#232326` | 输入框、标签、次要按钮填充 |
| `border` | `#E3DFD8` | `#2A2A2E` | 细线、卡片描边 |
| `text` | `#151515` | `#F4F2EE` | 主文字 |
| `textMuted` | `#6B675F` | `#A39E95` | 次要文字（对比度 ≥ 4.5） |
| `textFaint` | `#9C978E` | `#6C6862` | 占位、禁用，仅用于非关键信息 |
| `accent` | `#FF5A1F` | `#FF6B35` | 主按钮、进行中状态 |
| `onAccent` | `#151515` | `#151515` | 橙色上的文字与图标 |
| `accentSoft` | `#FFE7DC` | `#33190D` | 橙色浅底 |
| `accentText` | `#C2410C` | `#FF8A5C` | 页面底色上的橙色文字、文字按钮 |
| `data` | `#3557F0` | `#8197FF` | 图表、统计 |
| `dataSoft` | `#E5EAFF` | `#1B2142` | 图表浅底 |
| `success` | `#12805A` | `#3DD68C` | 已完成 |
| `onSuccess` | `#FFFFFF` | `#0E0E0F` | 绿色上的图标 |
| `successSoft` | `#DCF2E8` | `#10281C` | 已完成行底色 |
| `warning` | `#A86500` | `#F5B544` | 热身组、提醒 |
| `warningSoft` | `#FBEFD9` | `#33260C` | 热身组底色 |
| `danger` | `#C93636` | `#FF6B6B` | 删除、错误 |
| `dangerSoft` | `#FBE3E3` | `#3A1616` | 危险操作底色 |
| `inverse` | `#151515` | `#F4F2EE` | 选中标签底色 |
| `onInverse` | `#F4F2EE` | `#151515` | 选中标签文字 |

## 字体

使用系统字体（SF Pro / PingFang SC / Roboto），不加载自定义字体。数字一律使用等宽数字（RN `fontVariant: ['tabular-nums']`，SwiftUI `.monospacedDigit()`）。

| 令牌 | 字号 / 行高 | 字重 | 字距 | 用途 |
| --- | --- | --- | --- | --- |
| `display` | 44 / 48 | 800 | -1.2 | 计时器、首屏主数字 |
| `title1` | 30 / 36 | 800 | -0.6 | 页面标题 |
| `title2` | 22 / 28 | 700 | -0.3 | 区块标题 |
| `title3` | 17 / 22 | 700 | 0 | 卡片标题、列表主文字 |
| `number` | 22 / 26 | 800 | -0.4 | 卡片内统计数字 |
| `body` | 15 / 22 | 500 | 0 | 正文 |
| `bodyStrong` | 15 / 22 | 700 | 0 | 强调正文、按钮 |
| `caption` | 13 / 18 | 500 | 0 | 说明、单位 |
| `overline` | 11 / 14 | 800 | 1.4 | 眉题，英文大写，如 `TODAY` |

watchOS 在此基础上整体缩小：`display` 36、`title1` 22、`title3` 16、`body` 15、`caption` 12。

## 间距与圆角

- 间距：`xs 4` · `sm 8` · `md 12` · `lg 16` · `xl 20` · `xxl 28` · `xxxl 40`
- 页面左右边距 20；区块之间 28；卡片内边距 18；卡片之间 12。
- 圆角：`sm 10`（组次输入、小标签）· `md 14`（输入框、小按钮）· `lg 20`（卡片）· `xl 28`（首屏主卡）· `pill 999`（按钮、标签）。
- 细线宽 1。

## 组件

| 组件 | 规格 |
| --- | --- |
| 页面头 | 眉题（`overline`，`textMuted`）+ 标题（`title1`）；右侧圆形图标按钮 |
| 区块标题 | `title2` + 右侧文字操作（`bodyStrong`，`accentText`） |
| 卡片 | `surface` 底、1 px `border`、圆角 `lg`、内边距 18 |
| 信号卡 | `accent` 底、`onAccent` 文字、圆角 `xl`；每屏最多一张（首页今日训练、进行中训练） |
| 主按钮 | 高 52、胶囊、`accent` 底、`onAccent` 文字 `bodyStrong` 16；小号高 40、字号 14 |
| 次要按钮 | `surfaceAlt` 底、`text` 文字 |
| 文字按钮 | 透明底、`accentText` 文字 |
| 危险按钮 | `dangerSoft` 底、`danger` 文字 |
| 图标按钮 | 40 × 40 圆形、`surfaceAlt` 底、20 号图标 |
| 标签 | 高 34、胶囊、`surfaceAlt` 底、`textMuted` 字；选中 `inverse` 底 + `onInverse` 字 |
| 分段控件 | `surfaceAlt` 胶囊轨道、内边距 3；选中块 `raised` |
| 输入框 | 高 50、圆角 `md`、`surfaceAlt` 底、无描边；聚焦时 1.5 px `accent` 描边；标签在上方用 `caption` |
| 统计 | `number` 数字 + `caption` 单位与说明 |
| 迹线进度 | 高 6 胶囊轨道 `surfaceAlt`；填充：进行中 `accent`、已完成 `success`、统计 `data` |
| 小标记 | 高 22、圆角 6、11 / 700；橙 / 绿 / 蓝 / 黄四种浅底配深字 |
| 空状态 | 56 圆形 `surfaceAlt` 图标底 + `title3` + `caption` |
| 标签栏 | `surface` 底、顶部细线；选中项 `text` 色实心图标，未选中 `textFaint` 线框图标；标签 11 / 700 |
| 进行中训练条 | 有进行中训练时浮在标签栏上方：`accent` 底胶囊，显示训练名、时长与休息倒计时，点按回到训练 |

### 训练页

- 组次行：组号格 32 宽（热身组显示 `W`，`warning` 色，行底 `warningSoft`）；重量和次数输入高 44、圆角 `sm`、数字 17 / 800；完成按钮 44 圆形，未完成为 1.5 px `border` 描边，完成后 `success` 填充、`onSuccess` 对勾，整行底色 `successSoft`。
- RPE 为行下方的小标记，点按选择 5–10（步长 0.5）。
- 加重建议是动作卡内的一条 `dataSoft` 提示条，带「应用」文字按钮。
- 休息计时用信号卡样式置顶：`display` 数字倒计时 + 迹线进度 + 「+15 秒」「跳过」。

### 图表

- 折线 2 px `data` 色，数据点 6 px，最新一点用 `accent`；网格线 1 px `border`。
- 柱状：`data` 色，今天用 `accent`，无数据日用 `surfaceAlt`。
- 只用颜色区分时，同时给出文字或数值标签。

## 图标

- 手机端：Ionicons，线框为默认、实心表示选中，常用 20 / 22 号。
- Apple 端：SF Symbols，对应语义（`flame`、`timer`、`chart.line.uptrend.xyaxis`、`checkmark.circle.fill` 等）。
- 应用图标：信号橙底，墨色上升折线与终点圆点（`assets/logo.svg`）。
