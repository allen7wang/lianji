# 动作演示素材

`exercise-demos.json` 是四端共用的素材目录，共 55 项（51 项 GIF 与 4 项离线呼吸节奏动画）。通过内置动作的名称匹配素材，不改变已有动作 ID、训练计划或训练记录。自定义动作不会按同名内置动作套用素材。

## 在线人体模型 GIF（40 项）

- 来源：[ExerciseDB / AscendAPI 官方免费接口说明](https://docs.ascendapi.com/products/edb-v1/overview)。官方免费接口提供 180p GIF，无需认证。
- 应用仅保存公开的媒体链接，首次查看从 `static.exercisedb.dev` 获取，成功后缓存；未将这些在线 GIF 打包或重新分发。
- 当前用于开发原型，未确认商用素材授权。免费接口访问与商业媒体使用授权是不同事项；商用发布前应向提供方确认，或替换为有明确授权的素材。
- 仅在用户打开演示时加载，不向素材服务发送训练、体重或饮食记录。

## 面拉（face_pull.gif）

- 作品：Facepull，wger 动作 222；作者：Goulart。
- 来源：[wger 动作页面](https://wger.de/en/exercise/222/view/)，[原视频](https://wger.de/media/exercise-video/222/245a824b-cd39-45f2-b251-2c0b7efead0d.MOV)。
- 许可：[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。wger 元数据标记视频作者为 Goulart、许可编号为 2（CC BY-SA 4.0）；[wger 视频功能说明](https://github.com/wger-project/wger/pull/970)说明视频使用该许可。
- 修改：视频转换为循环 GIF，宽度调整为 384 像素、8 帧/秒、128 色。修改后的 `face_pull.gif` 继续按 CC BY-SA 4.0 提供。应用演示页展示作者来源和许可链接。

## 平板支撑（plank.gif）

练迹原创简洁动作示意动画，由 `scripts/create_plank_demo.py` 生成。保持支撑姿势，呼吸环表示自然呼吸；没有模拟身体反复起落。

## 地面、核心和间歇原创简图（9 项）

由 `scripts/create_ground_demos.py` 使用原创关节坐标绘制，未使用源照片、视频或官方课程图像。包括开合跳、蟹行、鸟狗式、猫牛式、侧弓步，以及兽式支撑、蟹式支撑、猿式深蹲和侧平板支撑。静态支撑类只显示自然呼吸；动态练习为简洁关节示意，可暂停观察姿势。

这些简图随四端打包，可离线播放。动物流计划属于独立编写的基础练习，不表示 Animal Flow 官方课程或认证。新增在线 GIF 的实际动作已逐项观察核对；公开接口的近似搜索结果不直接作为动作匹配依据。

## 播放与资源

手机端使用 Expo SDK 57 的 `expo-image` 播放和缓存 GIF，离开演示页或进入后台时停止播放。Mac / Apple Watch 使用 ImageIO 解码及 SwiftUI 定时刷新；手表限制解码尺寸和帧数，离开页面、进入后台后停止刷新。缓存可由操作系统清理，在线素材的可用性取决于提供方。

## 离线呼吸节奏动画（4 项）

腹式呼吸、等长呼吸、延长呼气和方块呼吸采用练迹原创程序动画，并非网络 GIF。四端从 `breathing-profiles.json` 读取相同的阶段时长，依据实际经过时间显示圆环变化与文字计数；不需要额外素材下载。呼吸目录按名称只匹配内置动作，自定义同名动作不自动套用节奏。

原有 40 项在线 GIF 和 11 项本地 GIF 不变。轻柔呼吸说明参考 [NHS](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/)；方块节奏参考 [Cleveland Clinic](https://health.clevelandclinic.org/box-breathing-benefits)。示意界面和计划为独立编写，未复制来源图片，也未获得机构背书。
