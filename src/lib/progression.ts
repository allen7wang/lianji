import { isWarmup, type Exercise, type PlanItem, type WeightUnit, type Workout, type WorkoutSet } from './types';
import { kgToLb, lbToKg, MAX_WEIGHT_KG, roundToIncrement } from './units';

export type ProgressionAction = 'increase' | 'hold' | 'deload';

export type ProgressionSuggestion = {
  exerciseId: string;
  action: ProgressionAction;
  /** Suggested load in kilograms. */
  weight: number;
  /** Heaviest working set of the reference session, in kilograms. */
  baseline: number;
  reason: string;
};

type Session = { workout: Workout; sets: WorkoutSet[] };

const lowerBody = new Set(['腿', '全身']);

/** The two most recent finished sessions with loaded working sets, newest first. */
function recentSessions(exerciseId: string, current: Workout, workouts: Workout[], sets: WorkoutSet[]): Session[] {
  const start = Date.parse(current.startedAt);
  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || set.workoutId === current.id || isWarmup(set) || set.unit === 'seconds') continue;
    const group = byWorkout.get(set.workoutId);
    if (group) group.push(set);
    else byWorkout.set(set.workoutId, [set]);
  }
  return workouts
    .filter(workout => workout.id !== current.id && workout.endedAt && byWorkout.has(workout.id) && Date.parse(workout.endedAt) <= start)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map(workout => ({ workout, sets: byWorkout.get(workout.id)! }));
}

function targetReps(session: Session, exerciseId: string, planItems: PlanItem[]) {
  if (!session.workout.planId) return undefined;
  const item = planItems.find(entry => entry.planId === session.workout.planId && entry.exerciseId === exerciseId && entry.unit !== 'seconds');
  return item?.reps;
}

function met(session: Session, exerciseId: string, planItems: PlanItem[]) {
  const target = targetReps(session, exerciseId, planItems);
  return session.sets.every(set => set.completed && (target === undefined || set.reps >= target));
}

export function suggestProgression({ exercise, current, workouts, sets, planItems, weightUnit }: {
  exercise: Pick<Exercise, 'id' | 'muscle'>;
  current: Workout;
  workouts: Workout[];
  sets: WorkoutSet[];
  planItems: PlanItem[];
  weightUnit: WeightUnit;
}): ProgressionSuggestion | null {
  const [last, before] = recentSessions(exercise.id, current, workouts, sets);
  if (!last) return null;
  const baseline = Math.max(...last.sets.map(set => Number.isFinite(set.weight) ? set.weight : 0));
  if (!(baseline > 0)) return null;

  let action: ProgressionAction;
  let weight: number;
  let reason: string;
  if (met(last, exercise.id, planItems)) {
    const step = lowerBody.has(exercise.muscle) ? (weightUnit === 'lb' ? 10 : 5) : (weightUnit === 'lb' ? 5 : 2.5);
    action = 'increase';
    weight = weightUnit === 'lb' ? lbToKg(Math.round((kgToLb(baseline) + step) * 2) / 2) : baseline + step;
    reason = '上次全部完成';
  } else if (before && !met(before, exercise.id, planItems)) {
    action = 'deload';
    weight = roundToIncrement(baseline * 0.9, weightUnit === 'lb' ? 5 : 2.5, weightUnit);
    reason = '连续两次未完成';
  } else {
    action = 'hold';
    weight = baseline;
    reason = '上次有未完成组';
  }
  return { exerciseId: exercise.id, action, weight: Math.min(MAX_WEIGHT_KG, Math.max(0, Math.round(weight * 10000) / 10000)), baseline, reason };
}

export const progressionLabel: Record<ProgressionAction, string> = { increase: '建议加重', hold: '建议保持', deload: '建议减量' };
