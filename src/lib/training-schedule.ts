import { localDayKey } from './training-progress';
import type { Workout, WorkoutSet } from './types';

export type ScheduledTraining = { day: string; planId: string };

export function isScheduleDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseScheduleDay(value: unknown): Date | null {
  return isScheduleDay(value) ? new Date(`${value}T12:00:00`) : null;
}

export function scheduleKey({ day, planId }: ScheduledTraining) {
  return `${day}/${planId}`;
}

export function completedScheduleKeys(workouts: Workout[], sets: WorkoutSet[]): Set<string> {
  const completedWorkouts = new Set(sets.filter(set => set.completed).map(set => set.workoutId));
  const keys = new Set<string>();
  for (const workout of workouts) {
    if (workout.planId && workout.endedAt && completedWorkouts.has(workout.id)) {
      keys.add(scheduleKey({ day: localDayKey(new Date(workout.startedAt)), planId: workout.planId }));
    }
  }
  return keys;
}

export function scheduleStatus(entry: ScheduledTraining, todayKey: string, completedKeys: ReadonlySet<string>) {
  if (entry.day > todayKey) return '已安排';
  if (completedKeys.has(scheduleKey(entry))) return '已完成';
  return entry.day < todayKey ? '已错过' : '待训练';
}
