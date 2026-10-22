# 练迹 v1.3.0 预览版 · 离线动作教学与数据备份

## 动作教学与离线演示

- 新增 15 项离线真人 GIF，涵盖卧推、划船、引体向上、腿举、哑铃罗马尼亚硬拉和肩臂训练；逐项核对实际动作、器械、素材作者与许可，保留转换参数和来源校验信息。
- 55 个内置动作全部配备中文教学，每项包含 3 条步骤、2 条要点、2 条常见错误。四端读取同一份教学目录，同名自定义动作不会自动借用内置教学。
- 当前有 26 项本地 GIF、4 项离线呼吸动画；剩余 25 项 GIF 仍需联网。全部文字教学可离线查看，加载失败不影响查看步骤。
- 修正鸟狗式、蟹行的对侧手脚示意；Apple 原生端暂停与后台时间不再推进动图时间轴。
- 手机动作库增加「仅离线演示」，搜索支持用空格组合动作、器械和部位，大小写不敏感。动作选择器使用同一搜索规则。
- 手机列表使用按需渲染和单次历史统计，不再为每一行重复扫描全部训练记录，也不把 0 kg 显示为最高负重。
- 手机播放器新增前台 20 秒网络加载超时与重试入口、直达动作步骤；进入文字教学时暂停动图。动图默认跟随系统「减少动态效果」，仍可手动播放；呼吸引导在该设置下保持文字和倒计时，不缩放圆环。

## 数据备份与训练体验

- 「我的 → 数据与备份」可把动作、计划、训练记录、身体数据和饮食记录导出为 JSON，通过系统分享保存到「文件」、iCloud Drive 或其他位置。
- 从备份恢复前显示导出日期与数据规模，确认后在单个事务内整体替换本机数据；失败自动回滚。恢复前如需保留当前内容，请先导出一份备份。
- 训练页显示每个动作上次已完成训练的重量 × 次数，按秒项目显示上次秒数，方便安排本次训练。
- 修复已有未结束训练时，从计划开始会静默续用旧训练的问题；现在明确提供取消、继续原训练、放弃并按计划开始的选择。
- 修复 Xcode 27 / iOS 27 SDK 构建在 iOS 27 设备上的启动崩溃，保留 UIScene 生命周期适配。

## 安装包与升级

| 文件 | 使用范围 |
| --- | --- |
| `Lianji-1.3.0-Android.apk` | 独立 Android 安装包，沿用既有发布签名，可覆盖安装 |
| `Lianji-1.3.0-macOS-universal.zip` | Apple Silicon / Intel Mac 通用预览包，未签名、未公证 |
| `Lianji-1.3.0-iOS-Simulator.zip` | iPhone 模拟器预览包，不能安装到真实 iPhone |
| `Lianji-1.3.0-watchOS-Simulator.zip` | Apple Watch 模拟器预览包，不能安装到真实手表 |
| `SHA256SUMS` / `BUILDINFO.json` | 安装包校验值与发布构建信息 |

手机应用标识保持 `com.allenwang.lianji`，版本 1.3.0、版本代码 6；Apple 原生端同步为 1.3.0 / 6。不要先卸载旧版；同标识、同签名的覆盖安装用于保留原计划和训练记录。本版不修改数据库结构，备份文件格式版本仍为 1。

本机免费签名的 iPhone 开发包不会公开上传。真实 iPhone / Apple Watch 的自行构建、签名与安装条件见 [Apple 设备测试说明](apple-device-testing.md)。本次未发布到 App Store、TestFlight 或 Google Play。

## 验收边界

- 发布前已完成代码规范、类型、真实隔离 SQLite 逻辑与备份回滚检查，本地 GIF 解码、iOS 真机 / 模拟器构建以及 Android 资源导出。
- 前一轮预览版已覆盖安装到 iPhone，安装前备份、安装后核对七张表内容一致；本轮优化版完成构建，模拟器中已观察到离线演示筛选从 55 项变为 30 项。
- 按发布要求停止追加功能和装机验收；没有宣称本轮新增交互、正式 Android APK 或 Mac / Watch UI 已完成全量人工验收。发布构建使用仓库已有流水线，不额外触发 APK smoke test。
- 四端数据仍各自独立，暂无自动跨设备同步。手机 JSON 备份不包含 Mac 和 Apple Watch 的本地数据。
- 在线人体模型 GIF 仍为原型素材，商用发布前需确认许可或替换；第三方真人素材的署名、CC BY-SA 4.0 许可和修改说明见 [素材说明](../assets/exercises/README.md)。教学只作一般动作参考，不是个人训练或医疗处方。

## 参考

- [expo-file-system（SDK 57）](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/)
- [expo-sharing（SDK 57）](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/)
- [expo-document-picker（SDK 57）](https://docs.expo.dev/versions/v57.0.0/sdk/documentpicker/)
- [Expo UIScene 生命周期说明](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md)
