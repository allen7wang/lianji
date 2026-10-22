"""Decode every bundled GIF and check the original bird-dog's contralateral pose.

Requires Pillow, as do the demo-generation scripts. Does not use the network or app data.
"""
import json
from pathlib import Path
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class ExerciseAssetChecks(unittest.TestCase):
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
