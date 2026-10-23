"""Create original offline exercise diagrams from joint coordinates, not source images.

These are simplified movement references, not motion-captured anatomical models.
Requires Pillow and a Chinese font; set LIANJI_DEMO_FONT outside macOS.
Example: python3 scripts/create_supplemental_demos.py --preview /path/to/sheets
"""
import argparse
from functools import lru_cache
import hashlib
import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / 'assets/exercises'
BG, INK, GREEN, FAR = '#f5f7f4', '#28392f', '#8cb64e', '#9cae95'
EQUIPMENT, FLOOR = '#708078', 225
DEMOS = {
    'deadlift': ('硬拉', '杠铃由地面起拉 / 手臂伸直 / 伸髋站稳'),
    'cable_fly': ('绳索夹胸', '沿弧线合拢 / 肘角基本不变 / 躯干稳定'),
    'lat_pulldown': ('高位下拉', '横杆向胸前 / 不拉到颈后 / 控制回程'),
    'single_arm_row': ('单臂哑铃划船', '一手一膝撑凳 / 肘向后带 / 换侧练习'),
    'bulgarian_split_squat': ('保加利亚分腿蹲', '后脚放凳 / 前脚踩稳 / 双手持哑铃'),
    'triceps_pushdown': ('绳索下压', '固定上臂 / 只做屈伸肘 / 不靠体重压'),
    'crunch': ('卷腹', '肩胛轻离地 / 下背稳定 / 不做完整坐起'),
    'bodyweight_lunge': ('徒手弓步蹲', '向前迈步 / 平稳下沉 / 蹬回站立再换边'),
    'glute_bridge': ('臀桥', '肩背与脚掌支撑 / 肩髋膝大致连线'),
    'goblet_squat': ('哑铃高脚杯深蹲', '双手托哑铃上端 / 贴近胸口 / 脚掌踩实'),
    'mountain_climber': ('登山跑', '双手稳撑 / 双腿交替收膝 / 骨盆稳定'),
    'burpee': ('波比', '下蹲撑地—撤腿—收脚—轻跳 / 无俯卧撑'),
    'bear_crawl': ('熊爬', '双膝微离地 / 对侧手脚配合 / 小步慢爬'),
    'dead_bug': ('死虫式', '对侧手脚伸展 / 另一对收回 / 腰背稳定'),
    'dumbbell_step_up': ('哑铃登阶', '台上腿发力 / 另一脚跟上 / 控制下台'),
    'single_leg_rdl': ('哑铃单腿硬拉', '双手持哑铃 / 屈髋后移 / 后腿随躯干伸展'),
}


def blend(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def joint(a, b, upper: float = 40, lower: float = 40, bend=1):
    """Two-bone planar joint; keep the given support/contact endpoints fixed."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    distance = max(0.001, math.hypot(dx, dy))
    reach = min(upper + lower - 0.001, max(abs(upper - lower) + 0.001, distance))
    along = (upper * upper - lower * lower + reach * reach) / (2 * reach)
    height = math.sqrt(max(0, upper * upper - along * along))
    return (a[0] + along * dx / distance - bend * height * dy / distance,
            a[1] + along * dy / distance + bend * height * dx / distance)


def chain(a, b, upper: float = 40, lower: float = 40, bend=1):
    return [a, joint(a, b, upper, lower, bend), b]


def standing(hip=(256, 155), shoulder=(260, 98), face=(263, 70)):
    return {'torso': [shoulder, hip], 'head': face, 'arms': [], 'legs': [], 'equipment': []}


def pose(name, phase):
    t = math.tau * phase
    amount = (1 - math.cos(t)) / 2
    p = standing()
    if name == 'deadlift':
        hip = blend((249, 168), (277, 142), amount)
        angle = math.atan2(-40, 45) + (math.atan2(-60, 3) - math.atan2(-40, 45)) * amount
        shoulder = (hip[0] + 60 * math.cos(angle), hip[1] + 60 * math.sin(angle))
        face = (shoulder[0] + 26 * math.cos(angle), shoulder[1] + 26 * math.sin(angle))
        hand = (shoulder[0], shoulder[1] + 74)
        p = standing(hip, shoulder, face)
        p['legs'] = [chain((hip[0] - 8, hip[1] - 2), (271, FLOOR), 42, 42, -1), chain(hip, (283, FLOOR), 42, 42, -1)]
        p['arms'] = [[(shoulder[0] - 7, shoulder[1] - 2), (hand[0] - 7, hand[1] - 39), (hand[0] - 7, hand[1] - 2)], [shoulder, blend(shoulder, hand, .5), hand]]
        p['equipment'] = [('barbell', hand)]
    elif name == 'cable_fly':
        p['legs'] = [chain((248, 155), (228, FLOOR), 37, 38), chain((264, 155), (290, FLOOR), 37, 38, -1)]
        p['arms'] = []
        for side in (-1, 1):
            theta = math.radians(6 + 97 * amount)
            # Oblique projection of a horizontal arc, with the elbow bend retained.
            world = [(side * 16, 0, 126),
                     (side * (16 + 36 * math.cos(theta)), 36 * math.sin(theta), 124),
                     (side * (16 + 36 * math.cos(theta) + 32 * math.cos(theta + .12)),
                      36 * math.sin(theta) + 32 * math.sin(theta + .12), 121)]
            arm = [(256 + .9 * x + .55 * y, 223 - z + .12 * y) for x, y, z in world]
            p['arms'].append(arm)
            p['equipment'].append(('cable', [(68 if side < 0 else 438, 72), arm[-1]]))
    elif name == 'lat_pulldown':
        p = standing((256, 165), (256, 106), (256, 77))
        bar_y = 43 + 76 * amount
        p['legs'] = [[(247, 163), (214, 180), (214, FLOOR)], [(266, 163), (302, 180), (302, FLOOR)]]
        p['arms'] = [chain((239, 106), (198, bar_y), 38, 38, -1), chain((273, 106), (314, bar_y), 38, 38)]
        p['equipment'] = [('bench', (224, 169, 287, 178)), ('pad', (205, 170, 306, 176)),
                          ('cable', [(256, 35), (256, bar_y)]), ('bar', [(185, bar_y + 4), (198, bar_y), (314, bar_y), (327, bar_y + 4)])]
    elif name == 'single_arm_row':
        p = standing((325, 135), (205, 124), (172, 108))
        hand = blend((205, 202), (270, 160), amount)
        p['arms'] = [[(212, 122), (209, 161), (205, 196)], chain((205, 124), hand, 42, 39, -1)]
        p['legs'] = [[(333, 133), (320, 195), (379, 196)], [(325, 135), (357, 181), (378, FLOOR)]]
        p['equipment'] = [('bench', (154, 196, 392, 204)), ('dumbbell', hand)]
    elif name == 'bulgarian_split_squat':
        hip, shoulder = (270, 148 + 38 * amount), (268, 92 + 38 * amount)
        p = standing(hip, shoulder, (266, shoulder[1] - 28))
        p['legs'] = [chain((278, hip[1]), (350, 181), 48, 47), chain(hip, (216, FLOOR), 48, 47)]
        p['arms'] = [[(shoulder[0] + 6, shoulder[1]), (285, shoulder[1] + 35), (285, shoulder[1] + 68)],
                     [(shoulder[0] - 6, shoulder[1]), (252, shoulder[1] + 35), (252, shoulder[1] + 68)]]
        p['equipment'] = [('bench', (328, 181, 398, 189)), *[('dumbbell', a[-1]) for a in p['arms']]]
    elif name == 'triceps_pushdown':
        p = standing((260, 158), (270, 104), (277, 76))
        elbow = (284, 143)
        angle = math.radians(-32 + 122 * amount)
        hand = (elbow[0] + 46 * math.cos(angle), elbow[1] + 46 * math.sin(angle))
        p['arms'] = [[(278, 104), (292, 141), (hand[0] + 8, hand[1] - 2)], [(270, 104), elbow, hand]]
        p['legs'] = [chain((254, 158), (237, FLOOR), 35, 36), chain((266, 158), (289, FLOOR), 35, 36, -1)]
        p['equipment'] = [('cable', [(358, 43), (358, 60), hand]), ('rope', [hand, (hand[0] - 7, hand[1] + 7), (hand[0] + 8, hand[1] + 6)])]
    elif name == 'crunch':
        shoulder = (203, 211 - 24 * amount)
        p = standing((302, 213), shoulder, (167, 211 - 32 * amount))
        p['torso'] = [shoulder, (259, 213), (302, 213)]
        p['arms'] = [[(211, shoulder[1] - 3), (224, shoulder[1] - 28), (252, shoulder[1] - 14)],
                     [shoulder, (214, shoulder[1] - 29), (242, shoulder[1] - 13)]]
        p['legs'] = [[(311, 207), (363, 163), (418, FLOOR)], [(302, 213), (354, 170), (407, FLOOR)]]
    elif name == 'bodyweight_lunge':
        if phase < .18:
            step, down = phase / .18, 0
        elif phase < .5:
            step, down = 1, (phase - .18) / .32
        elif phase < .82:
            step, down = 1, ( .82 - phase) / .32
        else:
            step, down = (1 - phase) / .18, 0
        step = step * step * (3 - 2 * step)
        down = down * down * (3 - 2 * down)
        hip = (326 - 56 * step, 135 + 25 * step + 21 * down)
        shoulder = (hip[0] - 2, hip[1] - 55)
        front = (314 - 100 * step, FLOOR - (8 * math.sin(math.pi * step) if down == 0 else 0))
        p = standing(hip, shoulder, (shoulder[0], shoulder[1] - 28))
        p['legs'] = [chain((hip[0] + 7, hip[1]), (340, FLOOR), 45, 45), chain(hip, front, 45, 45)]
        p['arms'] = [[(shoulder[0] + 6, shoulder[1]), (shoulder[0] + 27, shoulder[1] + 27), (hip[0] + 7, hip[1] - 6)],
                     [(shoulder[0] - 6, shoulder[1]), (shoulder[0] - 25, shoulder[1] + 27), (hip[0] - 6, hip[1] - 6)]]
    elif name == 'glute_bridge':
        hip = (294, 215 - 34 * amount)
        p = standing(hip, (177, 213), (143, 211))
        p['arms'] = [[(184, 207), (220, 215), (255, 219)], [(177, 213), (213, 219), (247, 222)]]
        p['legs'] = [[(302, hip[1] - 5), (365, 159), (400, FLOOR)], [hip, (357, 163), (391, FLOOR)]]
    elif name == 'goblet_squat':
        hip, shoulder = (250 - 15 * amount, 154 + 35 * amount), (258 + 7 * amount, 98 + 40 * amount)
        p = standing(hip, shoulder, (shoulder[0] + 6, shoulder[1] - 28))
        p['legs'] = [chain((hip[0] - 8, hip[1] - 3), (272, FLOOR), 39.5, 40.5, -1), chain(hip, (282, FLOOR), 39.5, 40.5, -1)]
        upper = (shoulder[0] + 34, shoulder[1] + 7)
        p['arms'] = [[(shoulder[0] - 4, shoulder[1]), (shoulder[0] + 17, shoulder[1] + 36), (upper[0] - 6, upper[1] + 4)],
                     [(shoulder[0] + 6, shoulder[1]), (shoulder[0] + 31, shoulder[1] + 36), (upper[0] + 6, upper[1] + 4)]]
        p['equipment'] = [('vertical_dumbbell', upper)]
    elif name == 'mountain_climber':
        p = standing((307, 175), (181, 137), (150, 126))
        p['arms'] = [[(190, 134), (190, 178), (190, FLOOR)], [(181, 137), (181, 181), (181, FLOOR)]]
        p['legs'] = []
        for offset, reach in [(8, max(0, -math.sin(t))), (0, max(0, math.sin(t)))]:
            p['legs'].append([(307 + offset, 175), blend((381 + offset, 198), (235 + offset, 178), reach),
                              blend((455 + offset, FLOOR), (301 + offset, 217), reach)])
    elif name == 'bear_crawl':
        p = standing((322, 164), (199, 148), (166, 132))
        p['arms'], p['legs'] = [], []
        for far in (True, False):
            offset = 9 if far else 0
            arm_phase = t + math.pi if far else t
            leg_phase = t if far else t + math.pi
            hand = (199 + offset - 12 * math.sin(arm_phase), FLOOR - 7 * max(0, math.cos(arm_phase)))
            foot = (378 + offset - 12 * math.sin(leg_phase), FLOOR - 7 * max(0, math.cos(leg_phase)))
            p['arms'].append([(199 + offset, 148), (198 + offset, 185), hand])
            p['legs'].append([(322 + offset, 164), (322 + offset - 8 * math.sin(leg_phase), 210), foot])
    elif name == 'dead_bug':
        p = standing((310, 213), (205, 213), (171, 211))
        p['arms'], p['legs'] = [], []
        for far in (True, False):
            offset = 8 if far else 0
            arm_reach = max(0, -math.sin(t)) if far else max(0, math.sin(t))
            leg_reach = max(0, math.sin(t)) if far else max(0, -math.sin(t))
            sy = 207 if far else 213
            p['arms'].append([(205 + offset, sy), blend((205 + offset, sy - 41), (165 + offset, sy - 15), arm_reach),
                              blend((205 + offset, sy - 82), (127 + offset, sy - 29), arm_reach)])
            p['legs'].append([(310 + offset, sy), blend((310 + offset, sy - 54), (364 + offset, sy + 1), leg_reach),
                              blend((365 + offset, sy - 54), (418 + offset, sy + 2), leg_reach)])
    elif name == 'dumbbell_step_up':
        hip = blend((316, 163), (278, 113), amount)
        shoulder = (hip[0] + 2, hip[1] - 44)
        p = standing(hip, shoulder, (shoulder[0] + 2, shoulder[1] - 27))
        # Lift outside the box first, then cross its edge above the top surface.
        if amount < .65:
            following = (352, FLOOR + (173 - FLOOR) * amount / .65)
        else:
            crossing = (amount - .65) / .35
            following = (352 + (307 - 352) * crossing, 173 + 10 * crossing)
        p['legs'] = [chain((hip[0] + 8, hip[1]), following, 37, 37), chain(hip, (273, 183), 35, 35)]
        p['arms'] = [[(shoulder[0] + 6, shoulder[1]), (shoulder[0] + 17, shoulder[1] + 27), (shoulder[0] + 17, shoulder[1] + 54)],
                     [(shoulder[0] - 6, shoulder[1]), (shoulder[0] - 17, shoulder[1] + 27), (shoulder[0] - 17, shoulder[1] + 54)]]
        p['equipment'] = [('box', (248, 183, 331, 228)), *[('dumbbell', a[-1]) for a in p['arms']]]
    elif name == 'single_leg_rdl':
        hip = (267 - 9 * amount, 155 + 2 * amount)
        angle = -math.pi / 2 + math.radians(67) * amount
        shoulder = (hip[0] + 58 * math.cos(angle), hip[1] + 58 * math.sin(angle))
        face = (shoulder[0] + 26 * math.cos(angle), shoulder[1] + 26 * math.sin(angle))
        p = standing(hip, shoulder, face)
        back_angle = math.pi / 2 + math.radians(67) * amount
        back_foot = (hip[0] + 72 * math.cos(back_angle), hip[1] + 72 * math.sin(back_angle))
        p['legs'] = [[(hip[0] - 7, hip[1] - 3), blend((hip[0] - 4, hip[1] + 34), (back_foot[0] + 34, back_foot[1] - 7), amount), back_foot],
                     chain(hip, (283, FLOOR), 36, 37, -1)]
        p['arms'] = [[(shoulder[0] - 7, shoulder[1] - 2), (shoulder[0] - 7, shoulder[1] + 31), (shoulder[0] - 7, shoulder[1] + 64)],
                     [shoulder, (shoulder[0], shoulder[1] + 33), (shoulder[0], shoulder[1] + 66)]]
        p['equipment'] = [('dumbbell', a[-1]) for a in p['arms']]
    elif name == 'burpee':
        start = standing((290, 155), (290, 100), (290, 71))
        start['arms'] = [[(282, 100), (274, 133), (278, 164)], [(298, 100), (307, 133), (309, 164)]]
        start['legs'] = [chain((298, 155), (301, FLOOR)), chain((290, 155), (280, FLOOR))]
        crouch = standing((307, 191), (255, 168), (230, 154))
        crouch['arms'] = [chain((263, 165), (233, FLOOR), 34, 34), chain((255, 168), (225, FLOOR), 34, 34)]
        crouch['legs'] = [chain((315, 187), (305, FLOOR)), chain((307, 191), (295, FLOOR))]
        plank = standing((282, 191), (225, 169), (198, 159))
        plank['arms'] = [[(233, 166), (233, 195), (233, FLOOR)], [(225, 169), (225, 197), (225, FLOOR)]]
        plank['legs'] = [[(290, 187), (328, 204), (363, FLOOR)], [(282, 191), (320, 208), (355, FLOOR)]]
        raised = {**start, 'arms': [[(282, 100), (252, 77), (257, 48)], [(298, 100), (328, 77), (323, 48)]]}
        jumped = {key: ([(x, y - 12) for x, y in value] if key == 'torso' else
                         (value[0], value[1] - 12) if key == 'head' else
                         [[(x, y - 12) for x, y in limb] for limb in value] if key in ('arms', 'legs') else value)
                  for key, value in raised.items()}
        keys = [(0, start), (.16, crouch), (.34, plank), (.46, plank), (.64, crouch), (.80, raised), (.88, jumped), (.94, raised), (1, start)]
        left, right = next((a, b) for a, b in zip(keys, keys[1:]) if a[0] <= phase <= b[0])
        u = (phase - left[0]) / (right[0] - left[0])
        u = u * u * (3 - 2 * u)
        p = {'head': blend(left[1]['head'], right[1]['head'], u), 'equipment': []}
        p['torso'] = [blend(a, b, u) for a, b in zip(left[1]['torso'], right[1]['torso'])]
        for key in ('arms', 'legs'):
            p[key] = [[blend(a, b, u) for a, b in zip(l, r)] for l, r in zip(left[1][key], right[1][key])]
    else:
        raise ValueError(f'Unknown original demonstration: {name}')
    p['joints'] = [p['head'], *p['torso'], *[point for group in p['arms'] + p['legs'] for point in group]]
    return p


@lru_cache(maxsize=1)
def font():
    candidate = Path(os.environ.get('LIANJI_DEMO_FONT', '/System/Library/Fonts/STHeiti Medium.ttc'))
    if not candidate.is_file():
        raise RuntimeError('Set LIANJI_DEMO_FONT to an installed Chinese TrueType/OpenType font')
    return ImageFont.truetype(str(candidate), 16)


def stroke(draw, points, color, width):
    draw.line(points, fill=color, width=width, joint='curve')
    for x, y in points:
        radius = width / 2
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)


def equipment(draw, item):
    kind, points = item
    if kind in ('bench', 'pad', 'box'):
        draw.rounded_rectangle(points, radius=3, fill='#c1cbc0', outline=EQUIPMENT, width=2)
        if kind == 'bench':
            x1, y1, x2, y2 = points
            draw.line([(x1 + 12, y2), (x1 + 12, FLOOR)], fill=EQUIPMENT, width=4)
            draw.line([(x2 - 12, y2), (x2 - 12, FLOOR)], fill=EQUIPMENT, width=4)
    elif kind == 'dumbbell':
        x, y = points
        stroke(draw, [(x - 14, y), (x + 14, y)], EQUIPMENT, 4)
        for offset in (-12, 12):
            draw.rounded_rectangle((x + offset - 3, y - 9, x + offset + 3, y + 9), radius=2, fill=INK)
    elif kind == 'barbell':
        x, y = points
        stroke(draw, [(x - 45, y), (x + 45, y)], EQUIPMENT, 5)
        for offset in (-33, 33):
            draw.ellipse((x + offset - 7, y - 23, x + offset + 7, y + 23), fill=INK)
    elif kind == 'vertical_dumbbell':
        x, y = points
        stroke(draw, [(x, y), (x, y + 25)], EQUIPMENT, 5)
        draw.rounded_rectangle((x - 14, y - 4, x + 14, y + 4), radius=2, fill=INK)
        draw.rounded_rectangle((x - 12, y + 22, x + 12, y + 29), radius=2, fill=INK)
    elif kind == 'rope':
        center, left, right = points
        stroke(draw, [left, center, right], EQUIPMENT, 4)
    else:
        stroke(draw, points, EQUIPMENT, 3 if kind == 'cable' else 6)


def frame(name, phase):
    state = pose(name, phase)
    image = Image.new('RGB', (512, 288), BG)
    draw = ImageDraw.Draw(image)
    draw.text((18, 10), DEMOS[name][0] + ' · 原创动作示意', fill=INK, font=font())
    draw.line([(42, 229), (474, 229)], fill='#ced6cc', width=3)
    for item in state['equipment']:
        if item[0] not in ('dumbbell', 'vertical_dumbbell', 'barbell', 'rope', 'bar'):
            equipment(draw, item)
    for index, points in enumerate(state['legs']):
        stroke(draw, points, FAR if index == 0 else GREEN, 11)
        x, y = points[-1]
        stroke(draw, [(x - 3, y), (x + 9, y)], FAR if index == 0 else GREEN, 7)
    stroke(draw, state['torso'], INK, 19)
    for index, points in enumerate(state['arms']):
        stroke(draw, points, FAR if index == 0 else GREEN, 8)
    hx, hy = state['head']
    stroke(draw, [state['torso'][0], (hx, hy + 7)], INK, 9)
    draw.ellipse((hx - 12, hy - 14, hx + 12, hy + 14), fill=INK)
    for item in state['equipment']:
        if item[0] in ('dumbbell', 'vertical_dumbbell', 'barbell', 'rope', 'bar'):
            equipment(draw, item)
    draw.text((18, 251), DEMOS[name][1], fill='#61725e', font=font())
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=DEMOS)
    parser.add_argument('--output-dir', type=Path, default=ROOT)
    parser.add_argument('--preview', type=Path, help='Directory for four-action contact sheets')
    args = parser.parse_args()
    selected = [args.only] if args.only else list(DEMOS)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    sheets = []
    for name in selected:
        count = 64 if name == 'burpee' else 48
        frames = [frame(name, index / count) for index in range(count)]
        target = args.output_dir / f'{name}.gif'
        frames[0].save(target, save_all=True, append_images=frames[1:], duration=90, loop=0, optimize=True)
        preview = Image.new('RGB', (1024, 192), 'white')
        for column, fraction in enumerate((0, .25, .5, .75)):
            preview.paste(frames[int(count * fraction)].resize((256, 144)), (column * 256, 0))
        sheets.append(preview)
        print(f'{name}: {count} frames, {target.stat().st_size:,} bytes', flush=True)
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
        for start in range(0, len(sheets), 4):
            group = sheets[start:start + 4]
            sheet = Image.new('RGB', (1024, len(group) * 192), 'white')
            for row, preview in enumerate(group):
                sheet.paste(preview, (0, row * 192))
            target = args.preview / f'originals-{start // 4 + 1}.jpg'
            sheet.save(target, quality=94)
            print(target, flush=True)
    if not args.only:
        code_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        records = [{'id': name, 'asset': name + '.gif', 'generator': 'scripts/create_supplemental_demos.py',
                    'author': '练迹 contributors', 'license': 'MIT',
                    'licenseUrl': 'https://github.com/allen7wang/lianji/blob/main/LICENSE',
                    'generatorSha256': code_hash, 'renderedFrames': 64 if name == 'burpee' else 48,
                    'frameDurationMs': 90, 'variant': DEMOS[name][1]} for name in selected]
        (args.output_dir / 'original-demos.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    print(f'Created {len(selected)} original movement diagrams')


if __name__ == '__main__':
    main()
