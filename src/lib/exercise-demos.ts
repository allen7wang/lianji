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
  return { uri: demo.gifUrl };
}
