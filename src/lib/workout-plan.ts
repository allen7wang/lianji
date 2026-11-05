import type { PlanDraftItem, WorkoutSet } from './types';

export const planLimits = {
  sets: 20,
  reps: 1000,
  weight: 2000,
  restSeconds: 600,
};

export function draftPlanFromWorkout(sets: WorkoutSet[]): PlanDraftItem[] {
  const byExercise = new Map<string, WorkoutSet[]>();
  const completed = sets.filter(set => set.completed && Number.isFinite(set.reps) && set.reps > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.setNumber - b.setNumber);

  for (const set of completed) {
    const group = byExercise.get(set.exerciseId);
    if (group) group.push(set);
    else byExercise.set(set.exerciseId, [set]);
  }

  return [...byExercise.values()].map(group => {
    const last = group[group.length - 1];
    const unit = last.unit ?? 'reps';
    const matchingSets = group.filter(set => (set.unit ?? 'reps') === unit).length;
    const rest = last.restSeconds ?? 90;
    return {
      exerciseId: last.exerciseId,
      unit,
      sets: Math.min(matchingSets, planLimits.sets),
      reps: Math.min(planLimits.reps, Math.max(1, Math.round(last.reps))),
      weight: Number.isFinite(last.weight) ? Math.min(planLimits.weight, Math.max(0, last.weight)) : 0,
      restSeconds: Math.min(planLimits.restSeconds, Math.max(0, Math.round(Number.isFinite(rest) ? rest : 90))),
    };
  });
}
