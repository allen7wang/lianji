import catalog from '../../assets/exercises/exercise-demos.json';
import guides from '../../assets/exercises/exercise-guides.json';
import type { Exercise } from './types';

export type ExerciseDemo = typeof catalog[number] & { mediaKind?: string; aspectRatio?: number; referenceUrl?: string };
export type ExerciseGuide = typeof guides[number];

const demosByName = new Map(catalog.map(demo => [demo.name, demo]));
const guidesById = new Map(guides.map(guide => [guide.id, guide]));

// Existing installs use generated exercise IDs, so match built-ins by their unchanged name.
export function demoFor(exercise: Pick<Exercise, 'name' | 'isCustom'>): ExerciseDemo | undefined {
  return exercise.isCustom ? undefined : demosByName.get(exercise.name);
}

export function guideFor(exercise: Pick<Exercise, 'name' | 'isCustom'>): ExerciseGuide | undefined {
  const demo = demoFor(exercise);
  return demo ? guidesById.get(demo.id) : undefined;
}

export function demoMediaLabel(demo: ExerciseDemo) {
  if (demo.asset) return (demo.mediaKind ? demo.mediaKind === 'real' : demo.source.includes('wger')) ? '离线真人' : '离线示意';
  return demo.gifUrl ? '联网动图' : '离线呼吸';
}

export function demoSource(demo: ExerciseDemo) {
  if (demo.asset === 'barbell_bench.gif') return require('../../assets/exercises/barbell_bench.gif');
  if (demo.asset === 'incline_dumbbell_press.gif') return require('../../assets/exercises/incline_dumbbell_press.gif');
  if (demo.asset === 'dips.gif') return require('../../assets/exercises/dips.gif');
  if (demo.asset === 'seated_row.gif') return require('../../assets/exercises/seated_row.gif');
  if (demo.asset === 'dumbbell_rdl.gif') return require('../../assets/exercises/dumbbell_rdl.gif');
  if (demo.asset === 'leg_press.gif') return require('../../assets/exercises/leg_press.gif');
  if (demo.asset === 'leg_curl.gif') return require('../../assets/exercises/leg_curl.gif');
  if (demo.asset === 'calf_raise.gif') return require('../../assets/exercises/calf_raise.gif');
  if (demo.asset === 'lateral_raise.gif') return require('../../assets/exercises/lateral_raise.gif');
  if (demo.asset === 'reverse_fly.gif') return require('../../assets/exercises/reverse_fly.gif');
  if (demo.asset === 'barbell_curl.gif') return require('../../assets/exercises/barbell_curl.gif');
  if (demo.asset === 'hammer_curl.gif') return require('../../assets/exercises/hammer_curl.gif');
  if (demo.asset === 'skull_crusher.gif') return require('../../assets/exercises/skull_crusher.gif');
  if (demo.asset === 'pull_up.gif') return require('../../assets/exercises/pull_up.gif');
  if (demo.asset === 'dumbbell_shoulder_press.gif') return require('../../assets/exercises/dumbbell_shoulder_press.gif');
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
  if (demo.asset === 'cable_fly.gif') return require('../../assets/exercises/cable_fly.gif');
  if (demo.asset === 'push_up.gif') return require('../../assets/exercises/push_up.gif');
  if (demo.asset === 'barbell_row.gif') return require('../../assets/exercises/barbell_row.gif');
  if (demo.asset === 'lat_pulldown.gif') return require('../../assets/exercises/lat_pulldown.gif');
  if (demo.asset === 'single_arm_row.gif') return require('../../assets/exercises/single_arm_row.gif');
  if (demo.asset === 'barbell_squat.gif') return require('../../assets/exercises/barbell_squat.gif');
  if (demo.asset === 'romanian_deadlift.gif') return require('../../assets/exercises/romanian_deadlift.gif');
  if (demo.asset === 'bulgarian_split_squat.gif') return require('../../assets/exercises/bulgarian_split_squat.gif');
  if (demo.asset === 'leg_extension.gif') return require('../../assets/exercises/leg_extension.gif');
  if (demo.asset === 'overhead_press.gif') return require('../../assets/exercises/overhead_press.gif');
  if (demo.asset === 'triceps_pushdown.gif') return require('../../assets/exercises/triceps_pushdown.gif');
  if (demo.asset === 'crunch.gif') return require('../../assets/exercises/crunch.gif');
  if (demo.asset === 'hanging_leg_raise.gif') return require('../../assets/exercises/hanging_leg_raise.gif');
  if (demo.asset === 'deadlift.gif') return require('../../assets/exercises/deadlift.gif');
  if (demo.asset === 'kettlebell_swing.gif') return require('../../assets/exercises/kettlebell_swing.gif');
  if (demo.asset === 'bodyweight_squat.gif') return require('../../assets/exercises/bodyweight_squat.gif');
  if (demo.asset === 'bodyweight_lunge.gif') return require('../../assets/exercises/bodyweight_lunge.gif');
  if (demo.asset === 'glute_bridge.gif') return require('../../assets/exercises/glute_bridge.gif');
  if (demo.asset === 'goblet_squat.gif') return require('../../assets/exercises/goblet_squat.gif');
  if (demo.asset === 'mountain_climber.gif') return require('../../assets/exercises/mountain_climber.gif');
  if (demo.asset === 'burpee.gif') return require('../../assets/exercises/burpee.gif');
  if (demo.asset === 'bear_crawl.gif') return require('../../assets/exercises/bear_crawl.gif');
  if (demo.asset === 'dead_bug.gif') return require('../../assets/exercises/dead_bug.gif');
  if (demo.asset === 'dumbbell_step_up.gif') return require('../../assets/exercises/dumbbell_step_up.gif');
  if (demo.asset === 'single_leg_rdl.gif') return require('../../assets/exercises/single_leg_rdl.gif');
  return { uri: demo.gifUrl };
}
