import extraExercises from '../../assets/exercises/extra-exercises.json';
import type { Exercise } from './types';

export type BuiltinExercise = { id: string; name: string; muscle: string; equipment: string };

// The original library. IDs match the Apple apps so backups merge across devices.
export const starterExercises: BuiltinExercise[] = ([
  ['barbell_bench', '杠铃卧推', '胸', '杠铃'], ['incline_dumbbell_press', '上斜哑铃卧推', '胸', '哑铃'], ['dips', '双杠臂屈伸', '胸', '自重'],
  ['cable_fly', '绳索夹胸', '胸', '绳索'], ['push_up', '俯卧撑', '胸', '自重'], ['pull_up', '引体向上', '背', '自重'],
  ['barbell_row', '杠铃划船', '背', '杠铃'], ['lat_pulldown', '高位下拉', '背', '器械'], ['seated_row', '坐姿划船', '背', '器械'],
  ['single_arm_row', '单臂哑铃划船', '背', '哑铃'], ['barbell_squat', '杠铃深蹲', '腿', '杠铃'], ['leg_press', '腿举', '腿', '器械'],
  ['romanian_deadlift', '罗马尼亚硬拉', '腿', '杠铃'], ['bulgarian_split_squat', '保加利亚分腿蹲', '腿', '哑铃'], ['leg_extension', '腿屈伸', '腿', '器械'],
  ['leg_curl', '腿弯举', '腿', '器械'], ['calf_raise', '站姿提踵', '腿', '器械'], ['overhead_press', '杠铃肩推', '肩', '杠铃'],
  ['lateral_raise', '哑铃侧平举', '肩', '哑铃'], ['reverse_fly', '反向飞鸟', '肩', '哑铃'], ['face_pull', '面拉', '肩', '绳索'],
  ['barbell_curl', '杠铃弯举', '手臂', '杠铃'], ['hammer_curl', '锤式弯举', '手臂', '哑铃'], ['triceps_pushdown', '绳索下压', '手臂', '绳索'],
  ['skull_crusher', '仰卧臂屈伸', '手臂', '杠铃'], ['plank', '平板支撑', '核心', '自重'], ['crunch', '卷腹', '核心', '自重'],
  ['hanging_leg_raise', '悬垂举腿', '核心', '自重'], ['deadlift', '硬拉', '全身', '杠铃'], ['kettlebell_swing', '壶铃摆动', '全身', '壶铃'],
] as const).map(([id, name, muscle, equipment]) => ({ id, name, muscle, equipment }));

export const catalogExercises: BuiltinExercise[] = (extraExercises as BuiltinExercise[])
  .map(exercise => ({ id: `builtin:${exercise.id}`, name: exercise.name, muscle: exercise.muscle, equipment: exercise.equipment }));

export const builtinExercises = [...starterExercises, ...catalogExercises];
const canonicalByName = new Map(builtinExercises.map(exercise => [exercise.name, exercise.id]));

export const starterPlans: { id: string; name: string; note: string; exercises: string[] }[] = [
  { id: 'starter_push', name: '推日 · 胸肩三头', note: '适合上肢推力训练', exercises: ['barbell_bench', 'incline_dumbbell_press', 'overhead_press', 'lateral_raise', 'triceps_pushdown'] },
  { id: 'starter_pull', name: '拉日 · 背部二头', note: '适合上肢拉力训练', exercises: ['pull_up', 'barbell_row', 'lat_pulldown', 'face_pull', 'barbell_curl'] },
  { id: 'starter_legs', name: '腿日 · 下肢核心', note: '适合下肢力量训练', exercises: ['barbell_squat', 'romanian_deadlift', 'leg_press', 'leg_curl', 'plank'] },
];

/** The shared ID for a built-in exercise, or undefined for custom exercises and unknown names. */
export function canonicalExerciseId(exercise: Pick<Exercise, 'name' | 'isCustom'>) {
  return exercise.isCustom ? undefined : canonicalByName.get(exercise.name);
}

/**
 * Rewrites built-in exercises in backup-shaped tables to their shared IDs and
 * merges duplicates. Custom exercises keep their IDs even when a name matches.
 */
export function normalizeExerciseRows<T extends { exercises: Exercise[]; plan_items: { exerciseId: string }[]; workout_sets: { exerciseId: string }[] }>(tables: T): T {
  const remap = new Map<string, string>();
  const kept = new Map<string, Exercise>();
  for (const exercise of tables.exercises) {
    const canonical = canonicalExerciseId(exercise) ?? exercise.id;
    if (canonical !== exercise.id) remap.set(exercise.id, canonical);
    if (!kept.has(canonical)) kept.set(canonical, { ...exercise, id: canonical });
  }
  if (!remap.size && kept.size === tables.exercises.length) return tables;
  const swap = <R extends { exerciseId: string }>(row: R): R => remap.has(row.exerciseId) ? { ...row, exerciseId: remap.get(row.exerciseId)! } : row;
  return { ...tables, exercises: [...kept.values()], plan_items: tables.plan_items.map(swap), workout_sets: tables.workout_sets.map(swap) };
}
