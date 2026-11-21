# 练迹数据约定（v3.0）

手机端（SQLite）与 Mac / Apple Watch（JSON）各自存储，但共享同一份备份格式和以下规则。任何一端改动这些规则时，需要同步更新另一端与本文。

## 1. 备份格式

备份文件仍为 `version: 1`，新字段全部可选，旧版本应用会忽略它们，新版本读取旧备份时使用默认值。

```jsonc
{
  "app": "lianji",
  "version": 1,
  "exportedAt": "2026-11-21T08:00:00.000Z",
  "tables": {
    "exercises":    [{ "id", "name", "muscle", "equipment", "isCustom": 0 | 1 }],
    "plans":        [{ "id", "name", "note", "createdAt" }],
    "plan_items":   [{ "id", "planId", "exerciseId", "sortOrder", "sets", "reps", "weight", "unit": "reps" | "seconds", "restSeconds" }],
    "workouts":     [{ "id", "planId": string | null, "name", "startedAt", "endedAt": string | null, "note" }],
    "workout_sets": [{ "id", "workoutId", "exerciseId", "sortOrder", "setNumber", "weight", "reps", "completed": 0 | 1,
                       "unit": "reps" | "seconds", "restSeconds",
                       "kind": "working" | "warmup",   // v3 新增，缺省 "working"
                       "rpe": number | null }],        // v3 新增，缺省 null
    "body_entries": [{ "id", "recordedAt", "weight", "bodyFat": number | null }],
    "food_entries": [{ "id", "loggedAt", "meal", "name", "portion", "calories", "protein", "carbs", "fat" }]
  },
  "weeklyGoal": 0,                 // 0–7，0 表示未设置
  "schedule": [{ "day": "YYYY-MM-DD", "planId" }],
  "favoritePlanIds": ["..."],
  "preferences": {                 // v3 新增，整体可选，各字段可选
    "weightUnit": "kg" | "lb",     // 缺省 "kg"
    "calorieGoal": 0,              // 整数 0–10000 kcal，0 表示未设置
    "proteinGoal": 0               // 整数 0–1000 g，0 表示未设置
  }
}
```

- 重量始终以 **kg** 存储与导出；`weightUnit` 只影响显示和输入换算（1 lb = 0.45359237 kg）。
- 时间为 ISO 8601 字符串。
- 设备本地设置（休息通知、屏幕常亮、震动、健康同步）**不进入备份**。

### 字段校验（导入时逐行检查，任一失败则整体拒绝）

导入只拒绝类型错误或明显损坏的数据，不按输入上限卡范围：旧版本可能存有超出现行输入上限的记录（如 2100 kg），用户必须能恢复自己导出的备份。输入上限（重量 0–2000、次数 0–1000 等）只在编辑时检查。

| 字段 | 规则 |
| --- | --- |
| 所有 `id` | 非空字符串，同表内不重复 |
| 文本字段（名称、笔记、餐次、份量等） | 字符串 |
| 时间字段 | 可解析的 ISO 8601 字符串；`endedAt` 可为 `null` |
| `weight`、营养数值、`bodyFat` | 有限数，≥ 0（`bodyFat` 可为 `null`） |
| `reps`、`sets`、`sortOrder`、`setNumber`、`restSeconds` | 整数，≥ 0（`restSeconds` 可缺省） |
| `completed` / `isCustom` | 0 / 1（也接受布尔值） |
| `unit` | `reps` / `seconds`，缺省 `reps` |
| `kind` | `working` / `warmup`，缺省 `working` |
| `rpe` | `null` 或 5–10 之间、步长 0.5（新字段，严格检查） |
| 引用 | `plan_items.planId`、`workout_sets.workoutId` 必须存在；`exerciseId` 必须指向备份内的动作；`workouts.planId` 指向不存在的计划时按 `null` 导入 |

## 2. 动作 ID

| 类别 | ID 规则 |
| --- | --- |
| 最初 30 个内置动作 | 固定为下表的英文 slug，例如 `barbell_bench` |
| 动作目录扩展的内置动作 | `builtin:<extra-exercises.json 中的 id>` |
| 自定义动作 | 任意唯一字符串（UUID 或时间戳随机串） |

30 个内置动作（名称 → ID）：

```
杠铃卧推 barbell_bench        上斜哑铃卧推 incline_dumbbell_press  双杠臂屈伸 dips
绳索夹胸 cable_fly            俯卧撑 push_up                      引体向上 pull_up
杠铃划船 barbell_row          高位下拉 lat_pulldown               坐姿划船 seated_row
单臂哑铃划船 single_arm_row    杠铃深蹲 barbell_squat              腿举 leg_press
罗马尼亚硬拉 romanian_deadlift 保加利亚分腿蹲 bulgarian_split_squat 腿屈伸 leg_extension
腿弯举 leg_curl               站姿提踵 calf_raise                  杠铃肩推 overhead_press
哑铃侧平举 lateral_raise       反向飞鸟 reverse_fly                 面拉 face_pull
杠铃弯举 barbell_curl         锤式弯举 hammer_curl                 绳索下压 triceps_pushdown
仰卧臂屈伸 skull_crusher       平板支撑 plank                       卷腹 crunch
悬垂举腿 hanging_leg_raise    硬拉 deadlift                        壶铃摆动 kettlebell_swing
```

**规范化**：本地升级、替换恢复、合并导入时，凡 `isCustom = 0` 且名称属于内置目录（上表或 `extra-exercises.json`）的动作，一律改用规范 ID，并同步改写 `plan_items` / `workout_sets` 中的引用。若出现多个同名内置动作，合并为一个。自定义动作即使与内置动作同名也不改 ID。

新安装的三个示例计划使用固定 ID：`starter_push`、`starter_pull`、`starter_legs`。

## 3. 恢复方式

### 替换（原有行为）
清空本机数据后写入备份。恢复前先自动保存一份快照。

### 合并（v3 新增）
在一个事务中执行；失败则整体回滚。

1. 先对备份做动作 ID 规范化。
2. **动作**：本机已有相同 ID → 跳过；备份中的自定义动作与本机某个自定义动作同名 → 改用本机 ID；否则新增。
3. **计划**：ID 不存在 → 连同其 `plan_items` 一起新增；已存在 → 保留本机版本，忽略备份中的这条计划及其条目。
4. **训练**：只导入**已结束**的训练（`endedAt` 非空）。ID 不存在 → 连同组次一起新增；已存在 → 保留本机。未结束的训练一律跳过。
5. **身体 / 饮食记录**：ID 不存在则新增。
6. **训练安排 / 收藏**：取并集，只保留对应计划在本机存在的项。
7. **每周目标、偏好**：本机已设置则保留本机；本机未设置（0 或缺省）时采用备份中的值。
8. 返回各类新增数量，例如「新增 12 次训练、2 个计划、30 条身体记录」。

### 快照与撤销
替换或合并之前，先把本机当前数据导出为一份快照（同一备份格式），最多保留 3 份。「撤销上次导入」用最近一份快照执行替换恢复，然后删除这份快照。

## 4. 统计规则

- **热身组**（`kind = warmup`）不计入：训练容量、个人纪录、估算 1RM、动作进步曲线、上次组次对照与沿用、同计划对照、存为计划。
- 只要包含至少一个已完成的组（含热身组），这场训练就可以保存，也计入每周训练天数。
- **容量** = Σ 已完成正式组的 重量 × 次数（按秒组不计入）。
- **估算 1RM**（Epley）：`weight × (1 + reps / 30)`，只统计按次、重量 > 0、1 ≤ reps ≤ 12 的已完成正式组；`reps = 1` 时等于重量。显示时四舍五入到 0.5 kg（lb 模式下四舍五入到 1 lb）。
- **RPE**：可选，5–10，步长 0.5，只作记录与展示，不影响统计。

## 5. 加重建议

只对按次记录、上次正式组重量 > 0 的动作生成建议。

1. 找到这个动作最近一次已结束训练中的全部正式组（含未完成组）。
2. 目标次数：若那次训练来自计划且计划中仍有该动作，用计划条目的 `reps`；否则不比较次数。
3. **达标**：所有正式组均已完成，且（有目标次数时）每组 `reps ≥ 目标`。
4. 基准重量 = 那次训练正式组的最大重量。
5. 结果：
   - 达标 → **加重**：腿、全身动作 +5 kg，其余 +2.5 kg（lb 模式下分别 +10 lb / +5 lb，换算回 kg 存储）。
   - 未达标，且再上一次（同动作的倒数第二次训练）也未达标 → **减量**：基准 × 0.9，四舍五入到 2.5 kg（lb 模式 5 lb）。
   - 其他未达标情况 → **保持**基准重量。
6. 界面显示建议重量与原因（「上次全部完成」「上次有未完成组」「连续两次未完成」），可一键把建议重量填入本动作所有**未完成的正式组**。

## 6. 偏好与本地设置

| 设置 | 是否备份 | 手机端存储 | Mac / Watch 存储 |
| --- | --- | --- | --- |
| 每周目标 | 是（`weeklyGoal`） | `training_preferences` | `AppState.weeklyGoalDays` |
| 重量单位 / 热量目标 / 蛋白质目标 | 是（`preferences`） | `app_settings` | `AppState.preferences` |
| 休息通知 / 常亮 / 震动 / 健康同步 | 否 | `app_settings`（`device.*` 键） | `UserDefaults` |
