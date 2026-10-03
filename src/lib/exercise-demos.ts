import catalog from '../../assets/exercises/exercise-demos.json';
import type { Exercise } from './types';

export type ExerciseDemo = typeof catalog[number];

// Existing installs use generated exercise IDs, so match built-ins by their unchanged name.
export function demoFor(exercise: Pick<Exercise, 'name' | 'isCustom'>): ExerciseDemo | undefined {
  return exercise.isCustom ? undefined : catalog.find(item => item.name === exercise.name);
}

export function demoSource(demo: ExerciseDemo) {
  if (demo.asset === 'face_pull.gif') return require('../../assets/exercises/face_pull.gif');
  if (demo.asset === 'plank.gif') return require('../../assets/exercises/plank.gif');
  if (demo.asset === 'jumping_jack.gif') return require('../../assets/exercises/jumping_jack.gif');
  if (demo.asset === 'beast_hold.gif') return require('../../assets/exercises/beast_hold.gif');
  if (demo.asset === 'crab_hold.gif') return require('../../assets/exercises/crab_hold.gif');
  if (demo.asset === 'ape_hold.gif') return require('../../assets/exercises/ape_hold.gif');
  if (demo.asset === 'crab_walk.gif') return require('../../assets/exercises/crab_walk.gif');
  if (demo.asset === 'bird_dog.gif') return require('../../assets/exercises/bird_dog.gif');
  if (demo.asset === 'cat_cow.gif') return require('../../assets/exercises/cat_cow.gif');
  if (demo.asset === 'side_plank.gif') return require('../../assets/exercises/side_plank.gif');
  if (demo.asset === 'lateral_lunge.gif') return require('../../assets/exercises/lateral_lunge.gif');
  return { uri: demo.gifUrl };
}
