import type { SQLiteDatabase } from 'expo-sqlite';
import { id, type Plan, type PlanItem, type Workout, type WorkoutSet } from './types';

export type FinishedWorkoutEdit = {
  name: string;
  note: string;
  sets: Pick<WorkoutSet, 'id' | 'weight' | 'reps' | 'completed'>[];
};

async function createWorkout(db: SQLiteDatabase, planId: string | null, name: string, note: string) {
  const workoutId = id();
  await db.runAsync('INSERT INTO workouts (id, planId, name, startedAt, endedAt, note) VALUES (?, ?, ?, ?, NULL, ?)', workoutId, planId, name, new Date().toISOString(), note);
  return workoutId;
}

async function createWorkoutSet(db: SQLiteDatabase, workoutId: string, set: Pick<WorkoutSet, 'exerciseId' | 'sortOrder' | 'weight' | 'reps' | 'unit' | 'restSeconds'>, number: number) {
  await db.runAsync('INSERT INTO workout_sets (id, workoutId, exerciseId, sortOrder, setNumber, weight, reps, completed, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', id(), workoutId, set.exerciseId, set.sortOrder, number, set.weight, set.reps, set.unit ?? 'reps', set.restSeconds ?? 90);
}

export async function startWorkoutFromPlan(db: SQLiteDatabase, planId?: string) {
  let workoutId = '';
  await db.withExclusiveTransactionAsync(async transaction => {
    const active = await transaction.getFirstAsync<Workout>('SELECT * FROM workouts WHERE endedAt IS NULL LIMIT 1');
    if (active) { workoutId = active.id; return; }
    const plan = planId ? await transaction.getFirstAsync<Plan>('SELECT * FROM plans WHERE id = ?', planId) : null;
    if (planId && !plan) throw new Error('没有找到这个训练计划。');
    workoutId = await createWorkout(transaction, planId ?? null, plan?.name ?? '自由训练', plan?.note ?? '');
    if (!planId) return;
    const items = await transaction.getAllAsync<PlanItem>('SELECT * FROM plan_items WHERE planId = ? ORDER BY sortOrder', planId);
    for (const item of items) for (let number = 1; number <= item.sets; number++) {
      await createWorkoutSet(transaction, workoutId, item, number);
    }
  });
  return workoutId;
}

export async function repeatWorkoutFromHistory(db: SQLiteDatabase, sourceId: string): Promise<string | null> {
  let workoutId: string | null = null;
  await db.withExclusiveTransactionAsync(async transaction => {
    const active = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE endedAt IS NULL LIMIT 1');
    if (active) return;

    const source = await transaction.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ? AND endedAt IS NOT NULL', sourceId);
    if (!source) throw new Error('没有找到已结束的训练记录。');
    const sets = await transaction.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ? AND completed != 0 ORDER BY sortOrder, setNumber, id', sourceId);
    if (!sets.length) throw new Error('这次训练没有完成的组。');

    workoutId = await createWorkout(transaction, source.planId, source.name, '');
    const setNumbers = new Map<string, number>();
    for (const set of sets) {
      const number = (setNumbers.get(set.exerciseId) ?? 0) + 1;
      setNumbers.set(set.exerciseId, number);
      await createWorkoutSet(transaction, workoutId, set, number);
    }
  });
  return workoutId;
}

export async function editFinishedWorkout(db: SQLiteDatabase, workoutId: string, edit: FinishedWorkoutEdit) {
  const name = edit.name.trim();
  if (!name) throw new Error('请填写训练名称。');

  await db.withExclusiveTransactionAsync(async transaction => {
    const finished = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE id = ? AND endedAt IS NOT NULL', workoutId);
    if (!finished) throw new Error('没有找到已结束的训练记录。');

    const sets = await transaction.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ?', workoutId);
    const remaining = new Map(sets.map(set => [set.id, set]));
    if (remaining.size !== edit.sets.length) throw new Error('训练组数已变更，请重新打开这条记录。');

    const changedSets: FinishedWorkoutEdit['sets'] = [];
    for (const set of edit.sets) {
      const original = remaining.get(set.id);
      if (!original) throw new Error('训练组数已变更，请重新打开这条记录。');
      remaining.delete(set.id);

      const weightChanged = set.weight !== original.weight;
      const targetChanged = set.reps !== original.reps;
      if (weightChanged && (!Number.isFinite(set.weight) || set.weight < 0 || set.weight > 2000)) {
        throw new Error('重量需介于 0–2000 kg。');
      }
      if (targetChanged && (!Number.isInteger(set.reps) || set.reps < 0 || set.reps > 1000)) {
        throw new Error('次数或秒数需为 0–1000 的整数。');
      }
      if (set.completed !== 0 && set.completed !== 1) throw new Error('组的完成状态无效。');
      if (set.completed && set.reps <= 0) throw new Error('已完成的组需要填写大于 0 的次数或秒数。');
      if (weightChanged || targetChanged || set.completed !== original.completed) changedSets.push(set);
    }
    if (!edit.sets.some(set => set.completed)) throw new Error('请至少保留一组已完成的训练。');

    await transaction.runAsync('UPDATE workouts SET name = ?, note = ? WHERE id = ?', name, edit.note.trim(), workoutId);
    for (const set of changedSets) {
      await transaction.runAsync('UPDATE workout_sets SET weight = ?, reps = ?, completed = ? WHERE id = ? AND workoutId = ?', set.weight, set.reps, set.completed, set.id, workoutId);
    }
  });
}

export async function appendWorkoutSet(db: SQLiteDatabase, workoutId: string, exerciseId: string) {
  const previous = await db.getFirstAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ? AND exerciseId = ? ORDER BY setNumber DESC LIMIT 1', workoutId, exerciseId);
  if (!previous) return;
  await createWorkoutSet(db, workoutId, previous, previous.setNumber + 1);
}
