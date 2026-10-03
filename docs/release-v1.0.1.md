# 练迹 v1.0.1 · 首个公开预览版

练迹是一个无需注册的本地训练记录应用。本次发布 Android APK、macOS 和 Apple 模拟器预览包，以及各端完整源码。

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
| [`Lianji-1.0.1-Android.apk`](https://github.com/allen7wang/lianji/releases/download/v1.0.1/Lianji-1.0.1-Android.apk) | Android 7.0+ 独立安装包，支持 ARM64、ARMv7、x86 与 x86_64，下载后打开安装；如系统提示，允许当前下载来源安装应用。无需 Expo Go 或开发服务器。 |
| `Lianji-1.0.1-macOS-universal.zip` | macOS 14+ 桌面预览，包含 Apple Silicon 与 Intel 架构。解压后得到 `LianjiMac.app`；尚未进行 Developer ID 签名或公证。 |
| `Lianji-1.0.1-iOS-Simulator.zip` | 开发者用 iPhone 模拟器预览包，不能安装到真实 iPhone。 |
| `Lianji-1.0.1-watchOS-Simulator.zip` | 开发者用 Apple Watch 模拟器预览包，不能安装到真实手表。 |
| `SHA256SUMS.txt` | 下载文件的 SHA-256 校验值。 |
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
- iOS 独立应用已编译并在模拟器启动。
- Android Release APK 编译、固定发布签名、16 KB 文件对齐和内置资源校验通过。
- 最终签名的 Android APK 已在 Android 15 / API 35 模拟器完成安装、首页、四套计划入口、关闭后重新启动及崩溃日志检查，详见 [安装验证记录](https://github.com/allen7wang/lianji/actions/runs/37125182369)。发布页文件与被验证安装包的 SHA-256 一致。
- macOS 与 Apple Watch 预览包编译通过。
- 新增计划模板的界面点击验收、Android 真机与手表运行尚未完成；当前没有跨设备云同步。

## 当前范围

当前各端数据独立，没有账号或跨设备同步；卸载应用可能丢失本地记录。在线动作演示首次查看需要网络，素材授权和来源见 [动作素材说明](https://github.com/allen7wang/lianji/blob/v1.0.1/assets/exercises/README.md)。代码按 MIT 许可提供，第三方素材保留其各自许可。
