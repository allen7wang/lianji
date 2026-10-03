# 练迹 v1.0.1 · 首个公开预览版

练迹是一个无需注册的本地训练记录应用。本次发布 iOS / Android 的 Expo 源码、macOS / Apple Watch 的 SwiftUI 源码，以及 macOS 和 Apple 模拟器预览包。

## 功能

- 30 个内置力量训练动作及动图演示，支持自定义动作。
- 一分化、三分化、五分化、推拉腿四套计划模板，共 12 个训练日，可预览、整套添加并修改。
- 已有计划和编辑内容会保留，重复添加不会产生副本，删除训练日后可补齐。
- 逐组记录重量、次数及完成状态，支持自由训练、休息倒计时和训练笔记。
- 训练历史、容量统计、身体数据和饮食记录。
- 各端本地保存数据，手机端使用同一个应用标识 `com.allenwang.lianji`。

## 下载和运行

| 文件 / 平台 | 使用方式 |
| --- | --- |
| `Lianji-1.0.1-macOS-universal.zip` | macOS 14+ 桌面预览，包含 Apple Silicon 与 Intel 架构。解压后得到 `LianjiMac.app`；尚未进行 Developer ID 签名或公证。 |
| `Lianji-1.0.1-iOS-Simulator.zip` | 开发者用 iPhone 模拟器预览包，不能安装到真实 iPhone。 |
| `Lianji-1.0.1-watchOS-Simulator.zip` | 开发者用 Apple Watch 模拟器预览包，不能安装到真实手表。 |
| `SHA256SUMS.txt` | 下载文件的 SHA-256 校验值。 |
| Android | 提供完整源码，按 README 编译运行；本次没有发布 APK。 |
| 真实 iPhone / Apple Watch | 需要开发者签名后构建，当前没有提供 IPA、TestFlight 或商店版本。 |

将模拟器包解压后，在 Xcode 中启动兼容的模拟器，再使用以下命令安装。iOS 预览包在 iPhone 17 Pro / iOS 26.5 上完成启动验证；手表预览包在发布前完成编译，尚未完成手表界面验收。

```bash
# iPhone 模拟器
xcrun simctl install <iPhone模拟器UDID> app.app
xcrun simctl launch <iPhone模拟器UDID> com.allenwang.lianji

# Apple Watch 模拟器
xcrun simctl install <手表模拟器UDID> LianjiWatch.app
xcrun simctl launch <手表模拟器UDID> com.allenwang.lianji.watch
```

手机进入「计划 → 计划模板」；Mac 进入「训练计划 → 计划模板」；Apple Watch 从首页进入「计划模板」。

## 验证状态

- 代码规范、TypeScript 类型、训练计划导入及回滚检查通过。
- iOS 独立应用已编译并在模拟器启动，Android JavaScript / 资源打包通过。
- macOS 与 Apple Watch 预览包编译通过。
- 新增计划模板的模拟器点击验收尚未完成；Android 真机、手表运行及各端云同步均未验证。

## 当前范围

当前各端数据独立，没有账号或跨设备同步；卸载应用可能丢失本地记录。在线动作演示首次查看需要网络，素材授权和来源见 [动作素材说明](https://github.com/allen7wang/lianji/blob/v1.0.1/assets/exercises/README.md)。代码按 MIT 许可提供，第三方素材保留其各自许可。
