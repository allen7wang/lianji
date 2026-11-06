import type { SQLiteDatabase } from 'expo-sqlite';
import { findPreviousSetMatches } from './training-comparison';
import { defaultSetTarget } from './training-target';
import { id, type Exercise, type Plan, type PlanItem, type Workout, type WorkoutSet } from './types';

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

export async function reusePreviousWorkoutSet(db: SQLiteDatabase, setId: string, sourceSetId: string) {
  let copied = { weight: 0, reps: 0 };
  await db.withExclusiveTransactionAsync(async transaction => {
    const target = await transaction.getFirstAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE id = ?', setId);
    if (!target) throw new Error('找不到这组训练，请重新打开训练。');
    const current = await transaction.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ? AND endedAt IS NULL', target.workoutId);
    if (!current) throw new Error('只能在进行中的训练里沿用上次组次。');
    if (target.completed) throw new Error('这组训练已完成，请先取消勾选。');

    const [workouts, sets] = await Promise.all([
      transaction.getAllAsync<Workout>(`
        SELECT * FROM workouts WHERE endedAt IS NOT NULL AND id IN (
          SELECT workoutId FROM workout_sets WHERE exerciseId = ?
        )
      `, target.exerciseId),
      transaction.getAllAsync<WorkoutSet>(`
        SELECT workout_sets.* FROM workout_sets JOIN workouts ON workouts.id = workout_sets.workoutId
        WHERE workout_sets.exerciseId = ? AND (workouts.id = ? OR workouts.endedAt IS NOT NULL)
      `, target.exerciseId, current.id),
    ]);
    const source = findPreviousSetMatches(current, workouts, sets).get(setId);
    if (!source || source.id !== sourceSetId) throw new Error('上次组次已变更，请重新查看后再沿用。');
    if (!Number.isFinite(source.weight) || source.weight < 0 || source.weight > 2000 ||
        !Number.isInteger(source.reps) || source.reps < 1 || source.reps > 1000) {
      throw new Error('上次组次超出可填写范围，请手动填写。');
    }

    copied = { weight: source.weight, reps: source.reps };
    await transaction.runAsync('UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?', copied.weight, copied.reps, setId);
  });
  return copied;
}

export async function addWorkoutExercise(db: SQLiteDatabase, workoutId: string, exerciseId: string) {
  await db.withExclusiveTransactionAsync(async transaction => {
    const workout = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE id = ? AND endedAt IS NULL', workoutId);
    if (!workout) throw new Error('只能在进行中的训练里添加动作。');
    const exercise = await transaction.getFirstAsync<Exercise>('SELECT * FROM exercises WHERE id = ?', exerciseId);
    if (!exercise) throw new Error('找不到这个动作，请重新选择。');
    const existing = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM workout_sets WHERE workoutId = ? AND exerciseId = ? LIMIT 1', workoutId, exerciseId);
    if (existing) throw new Error('这个动作已在本次训练中，请选择其他动作。');

    const nextOrder = (await transaction.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sortOrder), -1) + 1 AS n FROM workout_sets WHERE workoutId = ?', workoutId))?.n ?? 0;
    await createWorkoutSet(transaction, workoutId, { exerciseId, sortOrder: nextOrder, ...defaultSetTarget(exercise) }, 1);
  });
}

export async function replaceWorkoutExercise(db: SQLiteDatabase, workoutId: string, exerciseId: string, replacementId: string, expectedSetIds?: string[]) {
  await db.withExclusiveTransactionAsync(async transaction => {
    const workout = await transaction.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ? AND endedAt IS NULL', workoutId);
    if (!workout) throw new Error('只能替换进行中训练的动作。');
    const sets = await transaction.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ? AND exerciseId = ? ORDER BY sortOrder, setNumber, id', workoutId, exerciseId);
    if (!sets.length) throw new Error('找不到要替换的动作，请重新打开训练。');
    if (expectedSetIds) {
      const expected = [...expectedSetIds].sort();
      const current = sets.map(set => set.id).sort();
      if (expected.length !== current.length || expected.some((setId, index) => setId !== current[index])) {
        throw new Error('这个动作的组数已变更，请重新确认。');
      }
    }
    if (sets.some(set => set.completed)) throw new Error('这个动作已有完成组，无法替换。');
    if (exerciseId === replacementId) throw new Error('请选择一个不同的动作。');

    const replacement = await transaction.getFirstAsync<Exercise>('SELECT * FROM exercises WHERE id = ?', replacementId);
    if (!replacement) throw new Error('找不到替换动作，请重新选择。');
    const existing = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM workout_sets WHERE workoutId = ? AND exerciseId = ? LIMIT 1', workoutId, replacementId);
    if (existing) throw new Error('这个动作已在本次训练中，请选择其他动作。');

    const target = defaultSetTarget(replacement);
    for (const set of sets) {
      await createWorkoutSet(transaction, workoutId, { ...set, ...target, exerciseId: replacementId }, set.setNumber);
    }
    await transaction.runAsync('DELETE FROM workout_sets WHERE workoutId = ? AND exerciseId = ?', workoutId, exerciseId);
  });
}

export async function moveWorkoutExercise(db: SQLiteDatabase, workoutId: string, exerciseId: string, direction: -1 | 1, expectedExerciseIds: string[]) {
  if (direction !== -1 && direction !== 1) throw new Error('请选择向上或向下移动动作。');
  await db.withExclusiveTransactionAsync(async transaction => {
    const workout = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE id = ? AND endedAt IS NULL', workoutId);
    if (!workout) throw new Error('只能调整进行中训练的动作顺序。');
    const sets = await transaction.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ? ORDER BY sortOrder, setNumber, id', workoutId);
    const groups = new Map<string, WorkoutSet[]>();
    for (const set of sets) {
      const group = groups.get(set.exerciseId);
      if (group) group.push(set);
      else groups.set(set.exerciseId, [set]);
    }
    const exerciseIds = Array.from(groups.keys());
    if (expectedExerciseIds.length !== exerciseIds.length || expectedExerciseIds.some((id, index) => id !== exerciseIds[index])) {
      throw new Error('动作列表已变更，请重新查看后移动。');
    }
    const source = exerciseIds.indexOf(exerciseId);
    if (source < 0) throw new Error('找不到要移动的动作，请重新查看训练。');
    const destination = source + direction;
    if (destination < 0 || destination >= exerciseIds.length) throw new Error(direction === -1 ? '这个动作已经在最前面。' : '这个动作已经在最后面。');

    exerciseIds[source] = exerciseIds[destination];
    exerciseIds[destination] = exerciseId;
    let sortOrder = 0;
    for (const exercise of exerciseIds) {
      for (const set of groups.get(exercise)!) {
        await transaction.runAsync('UPDATE workout_sets SET sortOrder = ? WHERE id = ? AND workoutId = ?', sortOrder++, set.id, workoutId);
      }
    }
  });
}

export async function appendWorkoutSet(db: SQLiteDatabase, workoutId: string, exerciseId: string) {
  await db.withExclusiveTransactionAsync(async transaction => {
    const workout = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM workouts WHERE id = ? AND endedAt IS NULL', workoutId);
    if (!workout) throw new Error('只能在进行中的训练里添加组数。');
    const previous = await transaction.getFirstAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ? AND exerciseId = ? ORDER BY setNumber DESC LIMIT 1', workoutId, exerciseId);
    if (!previous) throw new Error('这个动作已变更，请重新查看训练。');
    await createWorkoutSet(transaction, workoutId, previous, previous.setNumber + 1);
  });
}
