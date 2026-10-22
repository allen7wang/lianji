import { demoFor } from './exercise-demos';
import type { Exercise, WorkoutSet } from './types';

export function filterExercises(exercises: Exercise[], { query, muscle, offlineOnly = false }: { query: string; muscle: string; offlineOnly?: boolean }) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return exercises.filter(exercise => {
    if (muscle !== '全部' && exercise.muscle !== muscle) return false;
    if (offlineOnly) {
      const demo = demoFor(exercise);
      if (!demo || demo.gifUrl) return false;
    }
    const searchable = `${exercise.name} ${exercise.equipment} ${exercise.muscle}`.toLowerCase();
    return terms.every(term => searchable.includes(term));
  });
}

export function bestWeightsByExercise(sets: WorkoutSet[]) {
  const best = new Map<string, number>();
  for (const set of sets) {
    if (!set.completed || !Number.isFinite(set.weight) || set.weight <= 0) continue;
    if (set.weight > (best.get(set.exerciseId) ?? 0)) best.set(set.exerciseId, set.weight);
  }
  return best;
}
