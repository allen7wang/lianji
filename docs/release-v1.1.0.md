# 练迹 v1.1.0 预览版

## 新增内容

- 新增 16 套计划，合计 28 套、63 个训练日。四端共用目录，支持场景和运动项目筛选。
- 训练方式：HIIT 全身、低冲击间歇、20/10 间歇、动物流基础、地面流动组合、核心稳定、活动度与恢复。
- 专项力量：短跑、半马、全马、游泳、铁三、自行车、登山；另补充篮球和羽毛球。每个项目提供两个力量训练日，并使用不同动作、组数与休息安排。
- 新增 15 个内置动作及演示，共 51 个动作。40 项为在线 GIF，11 项随应用打包；其中新增的 9 项为原创简图。
- 支持按次或按秒记录、按秒动作计时，以及每个动作独立的组间休息设置。模板导入、计划编辑、开始训练和添加组数均保留单位与休息设置。

## 使用

进入「计划 → 计划模板」，选择「间歇训练」「地面流动」「核心与活动度」或「专项力量」，先预览训练日再添加整套计划。专项力量可继续选择运动项目。

在计划编辑页可切换次/秒和修改休息秒数。训练页的「计时」按钮启动当前动作倒计时；完成后手动勾选，随后开始该组的休息倒计时。计时器目前只在应用内显示，没有后台通知或自动完成判断。按秒项目不参与力量容量（kg × 次）计算。

专项模板提供配合运动专项的力量练习，用户仍需另行安排跑量、游泳距离、骑行时间及比赛日程。半马、全马和铁三的总负荷应结合专项课安排；模板说明提供热身、强度与恢复建议。20/10 模板采用间歇节奏，未要求原始 Tabata 最大强度。地面流动模板为独立编写的基础练习，未采用官方课程或编排。

## 升级与数据

手机应用标识仍为 `com.allenwang.lianji`，版本 1.1.0、版本代码 4，沿用固定 Android 发布签名。覆盖安装时保留 SQLite 数据；不要卸载旧版本后再安装。

升级会补齐内置动作，并为旧数据库增加单位和休息字段。旧计划、已编辑模板、自定义动作和历史记录保留；旧行默认按次、休息 90 秒，以保持原记录语义。新模板明确设置次/秒，重复添加保留编辑并补齐缺少的训练日。Apple 旧 JSON 缺少的新字段可兼容读取，四端仍各自保存本地数据。

## 安装与验证

[Android APK](https://github.com/allen7wang/lianji/releases/download/v1.1.0/Lianji-1.1.0-Android.apk)及 Apple 预览包见[发布页](https://github.com/allen7wang/lianji/releases/tag/v1.1.0)。Mac 预览包未签名或公证；iPhone 和 Apple Watch 包用于模拟器，无法安装到真机。尚未发布到应用商店。

已通过[代码规范、类型和隔离 SQLite 测试](https://github.com/allen7wang/lianji/actions/runs/37135683833)、[Android 原生构建](https://github.com/allen7wang/lianji/actions/runs/37132273784)和[Apple 原生构建与共享数据测试](https://github.com/allen7wang/lianji/actions/runs/37132276896)。数据测试覆盖旧记录、模板导入、单位和休息、复制组数及重新读取。

[发布 APK 的 Android 15 模拟器验收](https://github.com/allen7wang/lianji/actions/runs/37135696215)已通过：安装与冷启动、居家计划导入与重复添加、HIIT 计划编辑及 20 秒动作/40 秒休息计时、训练保存、动物流导入、九项专项力量筛选与预览、重新打开后计划保留。该检查从公开发布页下载安装包，并核对包校验值。

本地 iPhone 17 Pro / iOS 26.5 和 Mac 预览已成功启动，升级后原有计划与记录字段保留。Apple Watch 已验证原生构建和共享数据逻辑，尚未验证手表运行界面；本版未做真机验收。各包校验值与源码、构建信息见发布页的 `SHA256SUMS` 和 `BUILDINFO.json`。

## 参考

模板依据通用原则独立编写，具体动作组合未获得机构背书：

- [ACSM：高强度间歇训练](https://acsm.org/high-intensity-interval-training-fitness/)
- [NSCA：耐力与抗阻训练的整合](https://www.nsca.com/education/articles/kinetic-select/integration-of-endurance-resistance-training/)
- [Animal Flow：练习体系介绍](https://animalflow.com/what-is-animal-flow/)

素材来源与授权范围见[动作演示素材](../assets/exercises/README.md)。
