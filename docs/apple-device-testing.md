# 练迹 v1.2.0：iPhone / Apple Watch 真机测试

## 工程核查

- iOS：Expo SDK 57，`app.json` 固定 `com.allenwang.lianji`，版本 1.2.0 / build 5；`ios/` 未提交，由 Expo prebuild 与配置插件生成。工作流预期 workspace `ios/app.xcworkspace`、scheme/target `app`。本地生成后须用 `xcodebuild -list -workspace ios/app.xcworkspace` 核实。
- 原生工程 `apple/LianjiApple.xcodeproj`：共享 scheme/target `LianjiMac`、`LianjiWatch`，Bundle ID 分别 `com.allenwang.lianji.mac`、`com.allenwang.lianji.watch`。watchOS 最低 10.0，macOS 最低 14.0。
- Watch 设置 `WKWatchOnly=YES`、`WKRunsIndependentlyOfCompanionApp=YES`，为独立 watch-only app，不是 iPhone companion。没有 iOS target、Watch 嵌入阶段、WatchConnectivity 或 iCloud 同步；两端需分别安装，训练数据各自保存。
- 原生 targets 使用 Automatic signing，但未配置 Development Team，未提供证书/描述文件。Watch 当前 `SKIP_INSTALL=YES`，本地 Run 不受影响；分发归档需覆盖为 NO 并检查 archive 确实包含应用。
- 现有 CI 预览用 iphonesimulator / watchsimulator + CODE_SIGNING_ALLOWED=NO，macOS 亦未签名或公证。新增 iphoneos/watchos 编译步骤仍未签名、不可安装，不上传为可安装包。

## 优先方案与成本

| 方案 | 权限与成本 | 安装路径 | 适用性 |
| --- | --- | --- | --- |
| 本地 Xcode 自动开发签名 | Mac + Xcode + Apple Account；Personal Team 可免费尝试，受能力/配额与 7 天有效期限制 | 配对设备，选择真实 destination，Run | 首选：两工程分别安装，改动最少 |
| 付费团队开发签名 | Apple Developer Program；已有会员则无新增会员费，通常 US$99/年，地区价格以 Apple 为准 | Xcode 注册设备并自动生成签名资产 | 免费团队无法配置 watch-only profile 或需要长期测试时 |
| Ad Hoc | 付费会员、开发者账号中注册 iPhone/Watch、分发证书及 profile | Archive → Distribute App → 注册设备分发 | 少量远程设备；每个独立 app 分别处理，Watch 安装流程需在实际工具中验证 |
| TestFlight | 付费会员、App Store Connect 权限和应用记录、签名归档 | 上传 → 完成合规信息 → 添加测试者 → TestFlight 安装 | 持续多人测试；构建有效期最多 90 天，外部测试可能需 Beta 审核 |

Xcode 本地安装使用的就是开发签名，两者并非互斥。先免费尝试；无法为现有 Bundle ID/Watch target 配置签名时，优先使用已有所属团队，不为了绕过错误改变身份。

## 数据保护：安装之前

1. 记录当前设备、应用来源（Expo Go / Simulator / 已签名独立 app）、Bundle ID、Team ID、版本与训练记录数量。现有签名团队未知时先确认。
2. 不卸载、不更改 Bundle ID、不清空应用数据；同一设备、同一身份和兼容签名的覆盖安装通常保留沙盒，但需备份并实际核验。跨团队覆盖可能失败，不能以卸载解决。
3. iOS 用 `lianji.db`（expo-sqlite），Watch/Mac 用 Application Support/Lianji/training.json；没有现成跨平台导入导出。Simulator、Expo Go、Android 与独立真机 app 的容器不同，不会自动迁移。
4. 对已存在的开发签名 iOS app，可在 Xcode Devices/Device Hub 的 Installed Apps 中尝试 Download Container；退出应用后备份整个容器，保留 SQLite 的 WAL/SHM 文件。若该应用/Watch 不支持下载容器，先保留现安装，另行确认备份能力，不承诺恢复。

## 本地安装：iPhone

1. 安装满足 SDK 57 要求的 Xcode（官方文档目前为 26.4+）、Node 22.13+、CocoaPods；在 Xcode Settings → Apple Accounts 登录。私钥仅在本机 Keychain。
2. Checkout 包含本指南的分支（基于 v1.2.0 的当前源码）。执行：
   ```sh
   npm ci --no-audit --no-fund
   npx expo prebuild --platform ios --no-install --no-clean
   pod install --project-directory=ios
   open ios/app.xcworkspace
   ```
3. USB 连接、解锁 iPhone 并信任 Mac；在 iPhone 设置 → 隐私与安全性 → 开发者模式启用并重启，按提示确认。
4. Xcode target `app` → Signing & Capabilities → Automatically manage signing → 选择现有 Team，核实 `com.allenwang.lianji`。若 ID 已属于其他团队，必须取得正确团队权限。
5. Scheme `app` → Edit Scheme → Run → Build Configuration 选择 Release；destination 选择真实 iPhone，点击 Run。Release 内嵌 JS，不依赖 Metro。
6. 如设备要求，在设置 → 通用 → VPN 与设备管理信任开发者。首次授权/签名错误按 Xcode 具体信息处理，不卸载旧 app。

## 本地安装：Apple Watch

1. Watch 与 iPhone 正常配对；在 Watch 设置 → 隐私与安全性启用开发者模式并按提示重启。通过 Xcode Devices/Device Hub 配对，确保真实 Watch 出现在 destinations。
2. 打开 `apple/LianjiApple.xcodeproj`；选择 target/scheme `LianjiWatch`，Signing & Capabilities 中自动签名并选择正确 Team，保留 `com.allenwang.lianji.watch`。
3. 选择真实 Apple Watch destination，Run（建议 Release）。iPhone app 不会自动带来此 watch-only app；不要假定 Watch app 中有 companion 安装按钮。
4. 若 Personal Team 无法为此 target 提供描述文件，保留错误信息并改用付费团队；未在真实账号中确认免费签名支持范围。

## 可选命令行：构建签名应用

在 Xcode 已登录、配对并完成首次签名后，从 Xcode destination 获取 ID：

```sh
xcodebuild -showdestinations -workspace ios/app.xcworkspace -scheme app
xcodebuild -showdestinations -project apple/LianjiApple.xcodeproj -scheme LianjiWatch
LIANJI_TEAM_ID=YOUR_TEAM_ID LIANJI_DEVICE_UDID=YOUR_IPHONE_ID bash scripts/build-apple-device.sh ios
LIANJI_TEAM_ID=YOUR_TEAM_ID LIANJI_DEVICE_UDID=YOUR_WATCH_ID bash scripts/build-apple-device.sh watchos
```

脚本只构建，不声称已安装；之后用上述 Xcode Run 安装。不要把 LIANJI_SIMULATOR_UDID 用于真机。脚本不接收/上传私钥、不改变 Bundle ID、不卸载应用。

## 需要分发时

- iOS：选择 generic iOS device → Product → Archive；在 Organizer 中按用途选择开发/注册设备分发或 App Store Connect。先核查 archive 的 Bundle ID、Team、版本和 build number。
- Watch：保持独立 watch-only 拓扑。归档示例：
  ```sh
  xcodebuild -project apple/LianjiApple.xcodeproj -scheme LianjiWatch -configuration Release -sdk watchos -destination 'generic/platform=watchOS' -archivePath device-build/LianjiWatch.xcarchive -allowProvisioningUpdates DEVELOPMENT_TEAM=YOUR_TEAM_ID CODE_SIGN_STYLE=Automatic SKIP_INSTALL=NO archive
  ```
  确认 archive 内包含 LianjiWatch.app，后续签名与导出是否适用于注册设备需由 Xcode Organizer 验证；不手工把 app 压成 zip 冒充 IPA。
- TestFlight：为 iOS 和独立 Watch 身份分别准备 App Store Connect 应用记录，依据平台支持建立并上传，完成图标、验证、合规信息等要求。若 build 5 已上传，使用更高 build number，并同步 Expo 配置与原生 project.yml / pbxproj。当前工程资源不能视为已通过上传验证。
- 只有需要 CI 自动签名/上传时才配置 GitHub protected environment、证书/profile 或 App Store Connect API 权限；本次不添加 secrets，不要求提交私钥。优先本地 Xcode 自动签名。

## 真机验收表（目前全部待验收）

记录源码 SHA、设备型号、OS、Team、版本/build、安装来源、结果、截图/日志。

- iPhone 和 Watch 各自：首次启动、离线启动、34 套模板可见且重复导入无重复、普通/计时训练、四套呼吸节奏开始/暂停/恢复/结束、历史保存。
- Watch：真实圆角屏幕布局、Digital Crown/滚动、文本截断与按钮可达性；腕部放下、熄屏、前后台切换、计时偏差与恢复行为。
- iPhone：锁屏、后台、强制退出再启动、Release 脱离 Mac/Metro 运行。
- 升级保留：安装前创建一条自定义计划和训练记录，使用同 Team/Bundle ID 覆盖安装，确认记录数量、内容和进行中训练；不得用全新空容器的启动通过替代升级验证。
- 不验收尚不存在的 iPhone↔Watch 同步；分别核对本地数据。

## 权限与完成边界

已准备：不含私钥的本地签名构建入口、设备 SDK 编译检查及安装路径。仍需用户完成：Mac/Xcode 环境、Apple Account 登录与正确 Team 授权、真实 iPhone/Watch 配对、开发者模式、首次签名授权、安装与上述验收。付费会员、Ad Hoc/分发证书、App Store Connect 权限仅在选择相应分发方案时需要。

参考：[Apple 真机运行](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)、[账号限制](https://developer.apple.com/help/account/basics/about-your-developer-account)、[注册设备分发](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)、[TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)、[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)、[Expo 本地构建](https://docs.expo.dev/guides/local-app-development/)。
