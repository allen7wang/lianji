# 练迹 Trail · 产品分析

整理日期：2026-11-28。外部链接的访问日期均为 2026-11-28。功能描述以仓库当前源码和 [v3.0.0 发布说明](../docs/release-v3.0.0.md) 为准。

## 1. 问题与使用场景

力量训练者要在组间休息的几十秒里记下重量和次数，还想看到上次练了多少、这次该加多少。现有产品各有代价：

- Keep 偏课程和社区，记录自由训练不够顺手。
- Hevy 和 Strong 以英文为主，需要注册账号，数据存在云端。
- 训记功能多，界面复杂。

练迹的回答是：打开就能记，不需要账号，数据留在本机；常用计划一键导入；每个动作都能离线看演示。

| 场景 | 设备 | 关键能力 |
| --- | --- | --- |
| 健身房按计划训练 | 手机或手表 | 从计划开始，逐组勾选，沿用上次组次，休息计时和通知 |
| 器械被占用 | 手机 | 更换待练动作，调整动作顺序 |
| 跑者每周两次力量训练 | 手机 | 导入半马或全马专项力量模板，按秒计时，排进训练日程 |
| 居家训练和新手 | 手机或网页 | 动作库按部位筛选，离线看演示、步骤和常见错误 |
| 周末复盘 | Mac 或网页 | 训练容量趋势、个人纪录、同计划对照、体重和饮食趋势 |

## 2. 用户画像

| 画像 | 特征 | 需求 | 练迹的对应功能 |
| --- | --- | --- | --- |
| A. 健身房进阶者（主） | 训练 1–5 年，每周 3–5 练，用 Apple Watch 或安卓手机 | 记录快，看上次成绩，追踪个人纪录和 1RM | 逐组记录、热身组和 RPE、估算 1RM 与重量建议、训练对照 |
| B. 耐力运动员 | 跑、骑、游、铁三或球类，力量是辅助训练 | 现成的专项模板，按秒计时，不想研究计划 | 9 套专项力量模板、训练安排、每周目标 |
| C. 居家训练者和新手 | 在家用徒手或哑铃，担心动作不标准 | 动作演示和要点，不注册也能用 | 55 个动作的离线演示和教学、新手和居家模板、呼吸训练 |

A 的付费意愿最高（Strong、Hevy 的付费用户主要是这类人）。B 是差异化切口，能通过跑团等社群集中触达。C 规模大，但已经被 Keep 的免费课程覆盖。

## 3. 核心功能与差异

| 功能 | 代码位置 |
| --- | --- |
| 逐组记录、热身组、RPE、kg / lb | `src/app/workout.tsx`，`src/lib/database.ts`；Apple 端 `apple/Shared/Models.swift`、`TrainingStore.swift` |
| 34 套模板、69 个训练日 | `assets/plans/training-programs.json`，`src/lib/plan-templates.ts`，`src/lib/import-plan-template.ts`，`apple/Shared/TrainingPrograms.swift` |
| 55 个动作的演示与教学 | `src/lib/builtin-exercises.ts`，`src/lib/exercise-demos.ts`，`assets/exercises/exercise-demos.json`，来源记录在 `media-sources.json` |
| 估算 1RM、重量建议、个人纪录 | `src/lib/progression.ts`，`src/lib/training-progress.ts`，`apple/Shared/Progression.swift` |
| 沿用上次、训练对照 | `src/lib/training-comparison.ts`，`apple/Shared/ReusePreviousSetButton.swift`，`TrainingComparisonViews.swift` |
| 训练安排与每周目标 | `src/lib/training-schedule.ts`，`src/app/training-schedule.tsx`，`apple/Shared/WeeklyGoalControl.swift` |
| 饮食与身体数据 | `src/lib/nutrition.ts`，`src/app/nutrition.tsx`，`apple/Shared/WellnessTrend.swift` |
| 写入 Apple 健康 / Health Connect | `src/lib/health.ios.ts`，`src/lib/health.android.ts`，`apple/Watch/WatchHealth.swift` |
| 备份、合并、撤销导入 | `src/lib/backup.ts`，`apple/Shared/TrainingBackup.swift`，`TrainingImport.swift`，格式见 `docs/data-contract.md` |
| 休息计时与通知 | `src/lib/notifications.ts`，`notifications.web.ts` |

**差异判断：**

- **相对独特**：
  - 不用注册，全部离线可用，健康数据只写不读，权限很小。
  - 中文的 9 套专项力量模板和 6 套呼吸练习。
  - 动作素材的来源、许可和转换参数逐项可查。
- **持平**：逐组记录、沿用上次、1RM、训练安排、备份。Hevy 和 Strong 都有这些功能。
- **落后**：
  - 没有云同步，Watch 和手机不通。
  - 没有社交和分享。
  - 没有食品库和扫码录入。
  - 没有 AI 或自适应计划（Fitbod、Keep 的主打功能）。

## 4. 竞品对比

| 产品 | 定位 | 平台 | 价格 | 对练迹的意义 |
| --- | --- | --- | --- | --- |
| [Hevy](https://www.sensai.fit/blog/hevy-vs-strong-2026) | 训练记录加社交，免费版功能多 | iOS、Android、Watch、Web | $2.99/月，$23.99/年，终身 $74.99；自称 1,800 万以上用户（[官网](https://www.hevyapp.com/)） | 全球标杆，英文市场很难正面竞争 |
| [Strong](https://www.sensai.fit/blog/strong-app-review-2026) | 极简训练记录 | iOS、Android、Watch | $4.99/月，$29.99/年，终身 $99.99 | 与练迹的形态最接近 |
| [Fitbod](https://trainera.fit/blogs/fitbod-pricing) | AI 生成训练计划 | iOS、Android、Watch | 新用户 $15.99/月或 $95.99/年；2026 年前订阅的老用户为 $12.99/月、$79.99/年 | 代表「自适应计划」方向 |
| [Keep](https://apps.apple.com/us/app/keep-%E8%B7%91%E6%AD%A5%E5%81%A5%E8%BA%AB%E9%AA%91%E8%A1%8C%E7%91%9C%E4%BC%BD-%E4%B8%80%E9%94%AE%E5%BC%80%E5%8A%A8/id952694580) | 课程、AI 教练、社区、电商 | iOS、Android、手表 | 会员 ¥19/月、¥218/年（App 描述中的价格，未注明年份，待核实）；超级 AI 会员 ¥648/年 | 国内流量入口，但重课程 |
| [训记](https://apps.apple.com/cn/app/id1464915553) | 中文训练记录、饮食和教练端 | iOS、Android、Watch | 永久会员 ¥88，月付 ¥28（[官网](https://api.xunjiapp.cn/)） | 个人开发者用买断经营的先例 |

## 5. 现状评估

**成熟度**：从 v1.0.1 到 v3.0.0 共有 18 份发布说明，四端功能基本对齐，数据规则写在 `docs/data-contract.md` 中。仍是「可运行的预览版」，账号、云同步、食品库、付费和 AI 都没有（见 README 的「当前边界」）。

**质量与测试**：

- `npm test` 包含 `tests/web-transaction.test.mjs` 和 `scripts/verify-plan-templates.mjs`。后者用内存中的 SQLite 检查 34 套模板、55 项演示、旧备份兼容、恢复、回滚和进度统计。
- Apple 端有 `scripts/verify-apple-programs.swift` 和 `verify-exercise-demos.swift`。素材由 `scripts/verify-exercise-assets.py` 校验。
- CI 跑 lint、类型检查、模板导入和资源打包，并在 Android 模拟器上冒烟测试发布的 APK。
- 缺口：
  - `progression`、`nutrition` 等模块没有逐个的单元测试。
  - 没有 iPhone 和 Watch 的真机验收。
  - Apple 健康的写入还没有真机验收记录。Health Connect 只在 Android 16 模拟器上核对过。

**技术债与风险**：

| 项目 | 影响 | 建议 |
| --- | --- | --- |
| 两套界面技术（React Native 和 SwiftUI）、两套存储（SQLite 和 JSON） | 每个功能要实现两次，规则靠文档对齐 | 商业化阶段以手机为主，Mac 和 Watch 只跟进核心功能 |
| Watch 是独立应用，不与 iPhone 同步 | 手表用户体验断裂 | 改为配套应用，用 WatchConnectivity 同步 |
| 三个 Bundle ID：`com.allenwang.lianji`、`.mac`、`.watch` | App 内购买和通用购买不能互通 | 上架前确定合并方案，需要技术评估 |
| Android 使用公开的 Expo 模板证书；v1.3.0 的密钥已丢失 | 任何人都能签出可覆盖安装的包；换钥后用户还要再迁移一次 | 上 Google Play 时启用 Play 应用签名，侧载版本同时说明迁移步骤 |
| README 的网页链接失效 | 访客打不开网页版 | 改为工作台地址，或者重新公开网页版 |

**数据与隐私**：

- 数据只存在本机，开发者不收集任何信息。
- 健康集成只申请写入权限（`health.ios.ts` 中的 `toShare`，以及 `health.android.ts` 中的 `accessType: 'write'`）。
- 动作的可选外部参考链接只在用户点击后才访问。
- 体重、体脂和饮食属于健康信息。一旦上云，就会进入 PIPL 的敏感个人信息和 GDPR 第 9 条的特殊类别数据，需要单独同意和加密。

## 6. 路线图建议

| 时间 | 优先级 | 事项 | 验证方式 |
| --- | --- | --- | --- |
| 3 个月 | P0 | Android 正式签名，上 Google Play 内部测试；iPhone 和 Watch 真机验收，提交 TestFlight | 100 名内测用户，W4 留存 ≥ 25% |
| 3 个月 | P0 | 隐私政策、Health Connect 声明、App 隐私标签；修正网页链接 | 通过商店审核 |
| 3 个月 | P1 | 首次使用引导：选择目标和器械，推荐模板 | 首日完成第一次训练的比例 ≥ 50% |
| 6 个月 | P0 | Watch 改为 iPhone 配套应用，训练双向同步 | 手表用户的 W4 留存不低于手机用户 |
| 6 个月 | P0 | 上线 Pro 买断（全部模板、1RM 与建议、饮食目标、进阶统计） | 下载转付费 ≥ 2% |
| 6 个月 | P1 | 分享训练卡片图片，不做社区 | 分享率 ≥ 5%，带来的新增下载占比 |
| 12 个月 | P1 | 可选的端到端加密云同步，按年订阅 | Pro 用户中的订阅率 ≥ 20% |
| 12 个月 | P2 | 教练版：管理学员和下发计划（参考训记 Coach Pro） | 访谈 10 位私教，≥ 3 位愿意付费 |
| 12 个月 | P2 | 食品库（优先用公有领域数据源，如 USDA FoodData Central，授权待核实） | 饮食记录的周活比例提升 |
| 12 个月 | P2 | 基于规则的自动加重和减载建议 | 采纳率 ≥ 30% |
