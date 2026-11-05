import { volumeOf, type TrainingUnit, type Workout, type WorkoutSet } from './types';

export type PreviousExerciseTraining = { workout: Workout; sets: WorkoutSet[] };
export type PreviousExerciseSets = Partial<Record<TrainingUnit, PreviousExerciseTraining>>;

type WorkoutTotals = {
  completedSets: number;
  volume: number;
  timedSeconds: number;
};

export type WorkoutComparison = {
  previousWorkout: Workout;
  current: WorkoutTotals;
  previous: WorkoutTotals;
};

function earlierWorkouts(current: Workout, workouts: Workout[]) {
  const currentStart = Date.parse(current.startedAt);
  if (!Number.isFinite(currentStart)) return [];

  const eligible = workouts.flatMap(workout => {
    if (workout.id === current.id || !workout.endedAt) return [];
    const start = Date.parse(workout.startedAt);
    const end = Date.parse(workout.endedAt);
    return start <= end && end <= currentStart ? [{ workout, start, end }] : [];
  });
  return eligible.sort((a, b) => b.start - a.start || b.end - a.end || a.workout.id.localeCompare(b.workout.id))
    .map(item => item.workout);
}

function completedSetsByWorkout(workouts: Workout[], sets: WorkoutSet[]) {
  const byWorkout = new Map(workouts.map(workout => [workout.id, [] as WorkoutSet[]]));
  for (const set of sets) {
    if (set.completed && Number.isFinite(set.reps) && set.reps > 0) byWorkout.get(set.workoutId)?.push(set);
  }
  return byWorkout;
}

export function findPreviousExerciseSets(current: Workout, workouts: Workout[], sets: WorkoutSet[]) {
  const prior = earlierWorkouts(current, workouts);
  const byWorkout = completedSetsByWorkout(prior, sets);
  const byExercise = new Map<string, PreviousExerciseSets>();

  for (const workout of prior) {
    for (const set of byWorkout.get(workout.id) ?? []) {
      const unit: TrainingUnit = set.unit === 'seconds' ? 'seconds' : 'reps';
      let references = byExercise.get(set.exerciseId);
      if (!references) {
        references = {};
        byExercise.set(set.exerciseId, references);
      }
      const reference = references[unit];
      if (!reference) references[unit] = { workout, sets: [set] };
      else if (reference.workout.id === workout.id) reference.sets.push(set);
    }
  }
  for (const references of byExercise.values()) {
    for (const reference of Object.values(references)) {
      reference.sets.sort((a, b) => a.sortOrder - b.sortOrder || a.setNumber - b.setNumber || a.id.localeCompare(b.id));
    }
  }
  return byExercise;
}

function totals(sets: WorkoutSet[]): WorkoutTotals {
  return {
    completedSets: sets.length,
    volume: volumeOf(sets),
    timedSeconds: sets.reduce((sum, set) => sum + (set.unit === 'seconds' ? set.reps : 0), 0),
  };
}

export function findWorkoutComparison(current: Workout, workouts: Workout[], sets: WorkoutSet[]): WorkoutComparison | null {
  if (!current.endedAt || !current.planId) return null;
  const candidates = earlierWorkouts(current, workouts.filter(workout => workout.planId === current.planId));
  if (!candidates.length) return null;
  const byWorkout = completedSetsByWorkout([current, ...candidates], sets);
  const previousWorkout = candidates.find(workout => byWorkout.get(workout.id)?.length);
  if (!previousWorkout) return null;
  return {
    previousWorkout,
    current: totals(byWorkout.get(current.id) ?? []),
    previous: totals(byWorkout.get(previousWorkout.id) ?? []),
  };
}
