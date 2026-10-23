"""Decode every bundled GIF and check the original bird-dog's contralateral pose.

Requires Pillow, as do the demo-generation scripts. Does not use the network or app data.
"""
import hashlib
import json
import math
from pathlib import Path
import runpy
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class ExerciseAssetChecks(unittest.TestCase):
    def test_every_builtin_demo_is_available_offline(self):
        catalog = json.loads((ROOT / 'assets/exercises/exercise-demos.json').read_text())
        self.assertEqual(len(catalog), 55)
        self.assertEqual([demo['id'] for demo in catalog if demo.get('gifUrl')], [], 'No built-in demonstration may depend on a prototype CDN')
        self.assertEqual(sum(bool(demo.get('asset')) for demo in catalog), 51)
        self.assertEqual(len(list((ROOT / 'assets/exercises').glob('*.gif'))), 51)

    def test_bundled_gifs_decode_and_loop(self):
        catalog = json.loads((ROOT / 'assets/exercises/exercise-demos.json').read_text())
        for demo in catalog:
            if not demo.get('asset'):
                continue
            with self.subTest(demo=demo['id']):
                path = ROOT / 'assets/exercises' / demo['asset']
                self.assertLess(path.stat().st_size, 5_000_000)
                with Image.open(path) as image:
                    self.assertEqual(image.format, 'GIF')
                    self.assertEqual(image.info.get('loop'), 0)
                    self.assertGreater(getattr(image, 'n_frames', 1), 1)
                    self.assertGreaterEqual(image.width, 180)
                    for frame in range(getattr(image, 'n_frames', 1)):
                        image.seek(frame)
                        image.load()
                        self.assertGreater(image.info.get('duration', 0), 0)

    def test_supplemental_diagrams_keep_contacts_and_source_identity(self):
        module = runpy.run_path(str(ROOT / 'scripts/create_supplemental_demos.py'))
        records = json.loads((ROOT / 'assets/exercises/original-demos.json').read_text())
        self.assertEqual({record['id'] for record in records}, set(module['DEMOS']))
        self.assertEqual(len(records), 16)
        code_hash = hashlib.sha256((ROOT / 'scripts/create_supplemental_demos.py').read_bytes()).hexdigest()
        for record in records:
            self.assertEqual(record['generatorSha256'], code_hash, 'Regenerate all original diagrams after changing their generator')
            for index in range(40):
                state = module['pose'](record['id'], index / 40)
                for x, y in state['joints']:
                    self.assertTrue(math.isfinite(x) and math.isfinite(y))
                    self.assertTrue(15 <= x <= 490 and 28 <= y <= 230, (record['id'], index, x, y))
                if record['id'] == 'dumbbell_step_up':
                    x, y = state['legs'][0][-1]
                    self.assertFalse(248 <= x <= 331 and y > 183, 'The following foot must lift above the step before crossing its edge')
                if record['id'] == 'triceps_pushdown':
                    self.assertEqual(state['arms'][1][:2], [(270, 104), (284, 143)], 'Upper arm stays fixed during pushdown')
        floor_start = module['pose']('deadlift', 0)
        self.assertAlmostEqual(floor_start['equipment'][0][1][1] + 23, 225, delta=1, msg='Deadlift starts with the plates at floor level')

    def test_supplemental_diagrams_move_opposite_limbs(self):
        module = runpy.run_path(str(ROOT / 'scripts/create_supplemental_demos.py'))
        bear = module['pose']('bear_crawl', 0)
        self.assertLess(bear['arms'][1][-1][1], bear['arms'][0][-1][1])
        self.assertLess(bear['legs'][0][-1][1], bear['legs'][1][-1][1])
        dead_bug = module['pose']('dead_bug', .25)
        self.assertLess(dead_bug['arms'][1][-1][0], dead_bug['arms'][0][-1][0])
        self.assertGreater(dead_bug['legs'][0][-1][0], dead_bug['legs'][1][-1][0])

    def test_crab_walk_lifts_opposite_hand_and_foot(self):
        with Image.open(ROOT / 'assets/exercises/crab_walk.gif') as image:
            image.seek(0)
            pose = image.convert('RGB')
            self.assertEqual(pose.getpixel((398, 225)), (140, 182, 78), 'Near foot stays planted while the near hand lifts')
            self.assertEqual(pose.getpixel((406, 220)), (156, 174, 149), 'The opposite far foot lifts with the near hand')

    def test_bird_dog_extends_opposite_colored_limbs(self):
        # Near arm is green; its opposite (far) leg must be grey, not green.
        with Image.open(ROOT / 'assets/exercises/bird_dog.gif') as image:
            image.seek(20)  # Fully extended pose in the 40-frame original loop.
            pose = image.convert('RGB')
            self.assertEqual(pose.getpixel((410, 133)), (156, 174, 149), 'Bird-dog must extend the far leg opposite the near arm')
            self.assertEqual(pose.getpixel((318, 205)), (140, 182, 78), 'The near leg stays planted while the near arm reaches')


if __name__ == '__main__':
    unittest.main()
