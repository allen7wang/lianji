import type { Workout, WorkoutSet } from './types';

export type ProgressMetric = 'weight' | 'reps' | 'seconds' | 'volume';

export type TrainingSession = {
  workout: Workout;
  day: string;
  completedSets: number;
  exerciseCount: number;
  volume: number;
  timedSeconds: number;
};

export type ExerciseProgressPoint = {
  workout: Workout;
  day: string;
  weight?: number;
  weightReps?: number;
  reps?: number;
  seconds?: number;
  volume?: number;
};

export type ExerciseProgress = {
  exerciseId: string;
  points: ExerciseProgressPoint[];
  best: Partial<Record<ProgressMetric, ExerciseProgressPoint>>;
};

const metrics: ProgressMetric[] = ['weight', 'reps', 'seconds', 'volume'];
const recordMetrics = ['weight', 'reps', 'seconds'] as const;

export function localDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear()).padStart(4, '0')}-${month}-${day}`;
}

export function mondayOf(date: Date) {
  const monday = new Date(date);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export type WeeklyTrainingActivity = {
  start: Date;
  count: number;
  days: { date: Date; key: string; trained: boolean; today: boolean }[];
};

export function buildWeeklyTrainingActivity(sessions: Pick<TrainingSession, 'day' | 'completedSets'>[], today: Date): WeeklyTrainingActivity[] {
  const todayKey = localDayKey(today);
  const trainedDays = new Set(sessions.filter(session => session.completedSets > 0 && session.day <= todayKey).map(session => session.day));
  const monday = mondayOf(today);

  return Array.from({ length: 4 }, (_, weekIndex) => {
    const start = new Date(monday);
    start.setDate(start.getDate() - weekIndex * 7);
    const days = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start);
      date.setDate(date.getDate() + dayIndex);
      const key = localDayKey(date);
      return { date, key, trained: trainedDays.has(key), today: key === todayKey };
    });
    return { start, count: days.filter(day => day.trained).length, days };
  });
}

export function buildTrainingProgress(workouts: Workout[], sets: WorkoutSet[]) {
  const finished = workouts.filter(workout => workout.endedAt)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const completedByWorkout = new Map(finished.map(workout => [workout.id, [] as WorkoutSet[]]));
  for (const set of sets) {
    if (set.completed) completedByWorkout.get(set.workoutId)?.push(set);
  }

  const byExercise = new Map<string, ExerciseProgress>();
  const sessions: TrainingSession[] = finished.map(workout => {
    const day = localDayKey(new Date(workout.startedAt));
    const completed = completedByWorkout.get(workout.id) ?? [];
    const points = new Map<string, ExerciseProgressPoint>();
    let volume = 0;
    let timedSeconds = 0;

    for (const set of completed) {
      let point = points.get(set.exerciseId);
      if (!point) {
        point = { workout, day };
        points.set(set.exerciseId, point);
      }
      if (set.reps <= 0) continue;
      if (set.unit === 'seconds') {
        timedSeconds += set.reps;
        point.seconds = Math.max(point.seconds ?? 0, set.reps);
        continue;
      }
      point.reps = Math.max(point.reps ?? 0, set.reps);
      if (set.weight > 0) {
        const setVolume = set.weight * set.reps;
        volume += setVolume;
        point.volume = (point.volume ?? 0) + setVolume;
        if (set.weight > (point.weight ?? 0) ||
            (set.weight === point.weight && set.reps > (point.weightReps ?? 0))) {
          point.weight = set.weight;
          point.weightReps = set.reps;
        }
      }
    }

    for (const [exerciseId, point] of points) {
      if (!point.reps && !point.seconds) continue;
      let progress = byExercise.get(exerciseId);
      if (!progress) {
        progress = { exerciseId, points: [], best: {} };
        byExercise.set(exerciseId, progress);
      }
      progress.points.push(point);
      for (const metric of metrics) {
        const best = progress.best[metric];
        const value = point[metric] ?? 0;
        if (value > (best?.[metric] ?? 0) ||
            (metric === 'weight' && value > 0 && value === best?.weight &&
             (point.weightReps ?? 0) > (best.weightReps ?? 0))) {
          progress.best[metric] = point;
        }
      }
    }

    return { workout, day, completedSets: completed.length, exerciseCount: points.size, volume, timedSeconds };
  });
  return { sessions, byExercise };
}

export function workoutMilestones(workout: Workout, byExercise: Map<string, ExerciseProgress>) {
  const milestones: { exerciseId: string; metric: typeof recordMetrics[number]; value: number; previous: number }[] = [];
  if (!workout.endedAt) return milestones;
  const ended = Date.parse(workout.endedAt);

  for (const { exerciseId, points } of byExercise.values()) {
    const current = points.find(point => point.workout.id === workout.id);
    if (!current) continue;
    const earlier = points.filter(point => point.workout.endedAt && Date.parse(point.workout.endedAt) < ended);
    for (const metric of recordMetrics) {
      const value = current[metric] ?? 0;
      const previous = earlier.reduce((best, point) => Math.max(best, point[metric] ?? 0), 0);
      if (value > previous) milestones.push({ exerciseId, metric, value, previous });
    }
  }
  return milestones;
}
