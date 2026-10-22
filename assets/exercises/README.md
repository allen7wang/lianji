# 动作演示素材

`exercise-demos.json` 是四端共用的素材目录，共 55 项（51 项 GIF 与 4 项离线呼吸节奏动画）。通过内置动作的名称匹配素材，不改变已有动作 ID、训练计划或训练记录。自定义动作不会按同名内置动作套用素材。

## 在线人体模型 GIF（25 项）

- 来源：[ExerciseDB / AscendAPI 官方免费接口说明](https://docs.ascendapi.com/products/edb-v1/overview)。官方免费接口提供 180p GIF，无需认证。
- 应用仅保存公开的媒体链接，首次查看从 `static.exercisedb.dev` 获取，成功后缓存；未将这些在线 GIF 打包或重新分发。
- 当前用于开发原型，未确认商用素材授权。免费接口访问与商业媒体使用授权是不同事项；商用发布前应向提供方确认，或替换为有明确授权的素材。
- 仅在用户打开演示时加载，不向素材服务发送训练、体重或饮食记录。

## 新增离线真人 GIF（15 项）

作者均为 **Goulart**，来源为 wger 公开原视频。逐视频核对 [wger 视频 API](https://wger.de/api/v2/video/) 的 `license_author` 与许可编号，再对照 [许可 API](https://wger.de/api/v2/license/)：15 项均标记为 CC BY-SA 4.0。实际使用的原视频 URL、视频/动作编号、源文件 SHA-256、剪辑时段与转换参数完整保存在 `media-sources.json`，不能只按检索名称匹配素材。

| 文件（`.gif`） | 实际演示变式 | wger 动作 / 视频编号 |
| --- | --- | --- |
| barbell_bench | 平板杠铃卧推 | 73 / 21 |
| incline_dumbbell_press | 上斜凳哑铃卧推 | 537 / 24 |
| dips | 双杠自重臂屈伸 | 194 / 66 |
| seated_row | 窄握坐姿绳索划船 | 512 / 1 |
| dumbbell_rdl | 哑铃罗马尼亚硬拉（侧面） | 507 / 3 |
| leg_press | 斜板器械腿举 | 371 / 44 |
| leg_curl | 俯卧器械腿弯举 | 365 / 35 |
| calf_raise | 器械站姿提踵 | 622 / 14 |
| lateral_raise | 站姿哑铃侧平举 | 348 / 6 |
| reverse_fly | 坐姿俯身哑铃反向飞鸟 | 82 / 7 |
| barbell_curl | 站姿杠铃弯举 | 91 / 49 |
| hammer_curl | 哑铃锤式弯举 | 272 / 51 |
| skull_crusher | 曲杆仰卧臂屈伸 | 246 / 63 |
| pull_up | 正握引体向上 | 475 / 71 |
| dumbbell_shoulder_press | 坐姿哑铃肩推 | 567 / 12 |

修改方式：截取演示片段，保留原速、去除音轨、缩放到宽 384 像素，转为 6 帧/秒、64 色循环 GIF。修改后的 GIF 仍按 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 提供；应用代码许可另见仓库 `LICENSE`。应用内展示作者、来源及许可链接。这些视频是动作变式参考，不构成对个人负重、活动幅度或训练适宜性的评估。

可用 `python3 scripts/prepare-exercise-demos.py --cache-dir <仓库外的视频缓存目录>` 重建；需要 ffmpeg 与 Pillow。脚本校验源视频 SHA-256，源文件发生变化时停止转换并要求重新核查；不把原始视频加入仓库。已排除不相符的候选：视频 507/3 实际使用哑铃，不能当作杠铃 RDL；659/55、659/56 和 803/58 是过顶伸肘，不用于绳索下压。

## 面拉（face_pull.gif）

- 作品：Facepull，wger 动作 222；作者：Goulart。
- 来源：[wger 动作页面](https://wger.de/en/exercise/222/view/)，[原视频](https://wger.de/media/exercise-video/222/245a824b-cd39-45f2-b251-2c0b7efead0d.MOV)。
- 许可：[Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)。wger 元数据标记视频作者为 Goulart、许可编号为 2（CC BY-SA 4.0）；[wger 视频功能说明](https://github.com/wger-project/wger/pull/970)说明视频使用该许可。
- 修改：视频转换为循环 GIF，宽度调整为 384 像素、8 帧/秒、128 色。修改后的 `face_pull.gif` 继续按 CC BY-SA 4.0 提供。应用演示页展示作者来源和许可链接。

## 平板支撑（plank.gif）

练迹原创简洁动作示意动画，由 `scripts/create_plank_demo.py` 生成。保持支撑姿势，呼吸环表示自然呼吸；没有模拟身体反复起落。

## 地面、核心和间歇原创简图（9 项）

由 `scripts/create_ground_demos.py` 使用原创关节坐标绘制，未使用源照片、视频或官方课程图像。包括开合跳、蟹行、鸟狗式、猫牛式、侧弓步，以及兽式支撑、蟹式支撑、猿式深蹲和侧平板支撑。静态支撑类只显示自然呼吸；动态练习为简洁关节示意，可暂停观察姿势。

鸟狗式已修正为近侧手臂与远侧腿共同伸展、另一对手脚支撑；蟹行已修正为对侧手脚配合抬起，避免同侧同时离地的误示意。可用 `python3 scripts/create_ground_demos.py --only bird_dog` 或 `--only crab_walk` 单独重建；`--preview <路径>` 可输出关键帧预览。

这些简图随四端打包，可离线播放。动物流计划属于独立编写的基础练习，不表示 Animal Flow 官方课程或认证。新增在线 GIF 的实际动作已逐项观察核对；公开接口的近似搜索结果不直接作为动作匹配依据。

## 离线动作教学

`exercise-guides.json` 为现有 55 个内置动作各提供 3 条步骤、2 条要点和 2 条常见错误，由手机和 Apple 原生端读取同一份目录。通过演示目录的 ID 关联，不改变用户动作 ID，也不把内置教学自动套给同名自定义动作。文字是简短动作参考，不是针对个人的训练处方；真人视频展示的器械和变式在动图 caption 中单独标注。

在线 GIF 不可用时，动作文字仍可离线查看。可运行 `npm run test:templates` 检查字段类型、目录唯一性、55 项教学覆盖、素材/许可记录和手机静态资源映射；`python3 scripts/verify-exercise-assets.py` 会逐帧解码全部本地 GIF，并检查鸟狗式、蟹行的对侧手脚示意。`scripts/verify-exercise-demos.swift` 用 Apple 的实际目录模型和 ImageIO 检查相同资源。

## 播放与资源

手机端使用 Expo SDK 57 的 `expo-image` 播放和缓存 GIF，离开演示页或进入后台时停止播放。Mac / Apple Watch 使用 ImageIO 解码及 SwiftUI 定时刷新；手表限制解码尺寸和帧数，离开页面、进入后台后停止刷新。缓存可由操作系统清理，在线素材的可用性取决于提供方。

## 离线呼吸节奏动画（4 项）

腹式呼吸、等长呼吸、延长呼气和方块呼吸采用练迹原创程序动画，并非网络 GIF。四端从 `breathing-profiles.json` 读取相同的阶段时长，依据实际经过时间显示圆环变化与文字计数；不需要额外素材下载。呼吸目录按名称只匹配内置动作，自定义同名动作不自动套用节奏。

本轮将 15 项在线素材替换为已核对署名与许可的离线真人 GIF；当前为 25 项在线 GIF、26 项本地 GIF，以及 4 项程序呼吸动画。轻柔呼吸说明参考 [NHS](https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/)；方块节奏参考 [Cleveland Clinic](https://health.clevelandclinic.org/box-breathing-benefits)。示意界面和计划为独立编写，未复制来源图片，也未获得机构背书。
