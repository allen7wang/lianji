import type { SQLiteDatabase } from 'expo-sqlite';
import { id, type Plan, type PlanItem, type Workout, type WorkoutSet } from './types';

export async function startWorkoutFromPlan(db: SQLiteDatabase, planId?: string) {
  let workoutId = '';
  await db.withExclusiveTransactionAsync(async transaction => {
    const active = await transaction.getFirstAsync<Workout>('SELECT * FROM workouts WHERE endedAt IS NULL LIMIT 1');
    if (active) { workoutId = active.id; return; }
    const plan = planId ? await transaction.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', planId) : null;
    if (planId && !plan) throw new Error('没有找到这个训练计划。');
    workoutId = id();
    await transaction.runAsync('INSERT INTO workouts (id, planId, name, startedAt, endedAt, note) VALUES (?, ?, ?, ?, NULL, ?)', workoutId, planId ?? null, plan?.name ?? '自由训练', new Date().toISOString(), plan?.note ?? '');
    if (!planId) return;
    const items = await transaction.getAllAsync<PlanItem>('SELECT * FROM plan_items WHERE planId = ? ORDER BY sortOrder', planId);
    for (const item of items) for (let number = 1; number <= item.sets; number++) {
      await transaction.runAsync('INSERT INTO workout_sets (id, workoutId, exerciseId, sortOrder, setNumber, weight, reps, completed, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', id(), workoutId, item.exerciseId, item.sortOrder, number, item.weight, item.reps, item.unit ?? 'reps', item.restSeconds ?? 90);
    }
  });
  return workoutId;
}

export async function appendWorkoutSet(db: SQLiteDatabase, workoutId: string, exerciseId: string) {
  const previous = await db.getFirstAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ? AND exerciseId = ? ORDER BY setNumber DESC LIMIT 1', workoutId, exerciseId);
  if (!previous) return;
  await db.runAsync('INSERT INTO workout_sets (id, workoutId, exerciseId, sortOrder, setNumber, weight, reps, completed, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', id(), workoutId, exerciseId, previous.sortOrder, previous.setNumber + 1, previous.weight, previous.reps, previous.unit ?? 'reps', previous.restSeconds ?? 90);
}
