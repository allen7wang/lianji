# 练迹 v1.3.0 预览版 · 数据备份与恢复

## 新增内容

- 「我的」页新增「数据与备份」：可把本机全部数据（动作库、计划与训练日、训练记录、身体数据、饮食记录）导出为一个 JSON 备份文件，通过系统分享面板保存到「文件」、iCloud Drive 或其他位置。
- 从备份恢复：选择备份文件后先显示导出日期与数据规模，确认后整体替换本机当前数据；导入在单个事务中完成，任何一步失败都会完整回滚，不会留下半份数据。
- 训练页每个动作显示「上次」完成的重量 × 次数（按秒动作显示上次秒数），方便渐进加重；数据来自最近一次包含该动作的已完成训练。
- 修复：存在未结束的训练时，从计划开始训练会静默续上旧训练而不带计划动作。现在会弹出提示，可选择取消、继续原训练，或放弃原训练并按计划开始。
- 修复（构建）：Xcode 27 / iOS 27 SDK 构建的应用在 iOS 27 设备上因未采用 UIScene 生命周期而启动即崩溃；现通过 expo-build-properties 的 enableSceneSupport 适配。

## 使用

导出：进入「我的 → 数据与备份 → 导出备份」，在分享面板选择「存储到文件」，建议保存到 iCloud Drive，文件名形如 `lianji-backup-2026-10-20.json`。

恢复：进入「我的 → 数据与备份 → 从备份恢复」，选择之前导出的 JSON 文件，核对弹窗中的日期和数据规模后点「替换并恢复」。恢复会替换本机全部数据且不可撤销；如需保留当前数据，请先导出一份当前备份。

备份包含动作库（含自定义动作）与全部记录，跨设备恢复后自定义动作和计划照常可用。备份不含 Mac 与 Apple Watch 的本地数据，它们仍各自独立保存。

## 升级与安装

手机标识仍为 `com.allenwang.lianji`，版本 1.3.0、版本代码 6；Android 沿用同一发布签名。覆盖安装保留原计划、编辑内容和训练记录；不要先卸载旧版本。

本版不修改数据库结构；备份文件带版本号，当前为 1，恢复时会校验来源和版本，格式不符会明确报错且不改动现有数据。

## 验证范围

代码检查覆盖规范、类型和真实隔离 SQLite 数据逻辑。新增备份测试覆盖：七表导出/导入逐行一致、非 JSON / 非练迹文件 / 版本不符 / 缺表 / 缺 id 的报错，以及导入中途失败时完整回滚（原数据保持不变）。计划冲突修复由既有单活跃训练语义测试与真机人工验证覆盖。

Apple 设备构建新增 iphoneos 未签名编译检查已在 CI 通过；iPhone 真机（iOS 27）安装、启动与备份导出/恢复流程经真机人工验收。所有平台真机行为与 Mac / Watch 打包验收仍按 docs/apple-device-testing.md 执行。

## 参考

- [expo-file-system（SDK 57）](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/)
- [expo-sharing（SDK 57）](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/)
- [expo-document-picker（SDK 57）](https://docs.expo.dev/versions/v57.0.0/sdk/documentpicker/)
- [Expo UIScene 生命周期说明](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md)
