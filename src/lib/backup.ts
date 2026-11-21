import { withWriteTransaction } from './write-transaction';
import type { SQLiteDatabase } from 'expo-sqlite';
import { normalizeExerciseRows } from './builtin-exercises';
import { insertScheduledTraining, isCalorieGoal, isProteinGoal, isWeeklyGoal, isWeightUnit, readFavoritePlanIds, readPreferences, readTrainingSchedule, readWeeklyGoal, writePreferences, writeWeeklyGoal } from './database';
import { isScheduleDay, scheduleKey, type ScheduledTraining } from './training-schedule';
import { id as newId, isRpe, type BodyEntry, type Exercise, type FoodEntry, type Plan, type PlanItem, type Preferences, type Workout, type WorkoutSet } from './types';

export const BACKUP_VERSION = 1;
export const SNAPSHOT_LIMIT = 3;

export type BackupTables = {
  exercises: Exercise[];
  plans: Plan[];
  plan_items: PlanItem[];
  workouts: Workout[];
  workout_sets: WorkoutSet[];
  body_entries: BodyEntry[];
  food_entries: FoodEntry[];
};

export type BackupFile = {
  app: 'lianji';
  version: number;
  exportedAt: string;
  tables: BackupTables;
  weeklyGoal?: number;
  schedule?: ScheduledTraining[];
  favoritePlanIds?: string[];
  preferences?: Partial<Preferences>;
};

export type RestoreMode = 'replace' | 'merge';

export type MergeSummary = {
  exercises: number;
  plans: number;
  workouts: number;
  bodyEntries: number;
  foodEntries: number;
  schedule: number;
  favorites: number;
};

export type SnapshotInfo = { id: string; createdAt: string; reason: RestoreMode };

const TABLES = ['exercises', 'plans', 'plan_items', 'workouts', 'workout_sets', 'body_entries', 'food_entries'] as const;
// Children first so foreign keys hold during the replace.
const DELETE_ORDER = ['plan_favorites', 'training_schedule', 'workout_sets', 'plan_items', 'food_entries', 'body_entries', 'workouts', 'plans', 'exercises'] as const;

function validateSchedule(schedule: unknown, plans: Plan[]) {
  if (schedule === undefined) return;
  if (!Array.isArray(schedule)) throw new Error('备份中的训练日程无效。');
  const planIds = new Set(plans.map(plan => plan.id));
  const entries = new Set<string>();
  for (const entry of schedule as (Partial<ScheduledTraining> | null)[]) {
    if (!entry || !isScheduleDay(entry.day) || typeof entry.planId !== 'string' || !planIds.has(entry.planId)) {
      throw new Error('备份中的训练日程包含无效日期或找不到对应计划。');
    }
    const key = scheduleKey({ day: entry.day, planId: entry.planId });
    if (entries.has(key)) throw new Error('备份中有重复的训练日程。');
    entries.add(key);
  }
}

function validateFavoritePlanIds(favorites: unknown, plans: Plan[]) {
  if (favorites === undefined) return;
  if (!Array.isArray(favorites)) throw new Error('备份中的收藏计划无效。');
  const planIds = new Set(plans.map(plan => plan.id));
  const seen = new Set<string>();
  for (const planId of favorites) {
    if (typeof planId !== 'string' || !planId || !planIds.has(planId)) throw new Error('备份中的收藏计划不存在。');
    if (seen.has(planId)) throw new Error('备份中有重复的收藏计划。');
    seen.add(planId);
  }
}

function validatePreferences(preferences: unknown) {
  if (preferences === undefined) return;
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) throw new Error('备份中的偏好设置无效。');
  const { weightUnit, calorieGoal, proteinGoal } = preferences as Record<string, unknown>;
  if (weightUnit !== undefined && !isWeightUnit(weightUnit)) throw new Error('备份中的重量单位无效。');
  if (calorieGoal !== undefined && !isCalorieGoal(calorieGoal)) throw new Error('备份中的热量目标无效。');
  if (proteinGoal !== undefined && !isProteinGoal(proteinGoal)) throw new Error('备份中的蛋白质目标无效。');
}

type Row = Record<string, unknown>;
const fail = (table: string, field: string): never => { throw new Error(`备份内容已损坏：${table} 中的 ${field} 无效。`); };
const text = (row: Row, table: string, field: string) => { if (typeof row[field] !== 'string') fail(table, field); };
const date = (row: Row, table: string, field: string) => { if (typeof row[field] !== 'string' || !Number.isFinite(Date.parse(row[field] as string))) fail(table, field); };
// Imports reject wrong types, not legacy values above today's input limits.
const number = (row: Row, table: string, field: string) => {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(table, field);
};
const integer = (row: Row, table: string, field: string, optional = false) => {
  const value = row[field];
  if (optional && value === undefined) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail(table, field);
};
const flag = (row: Row, table: string, field: string) => {
  const value = row[field];
  if (value !== 0 && value !== 1 && value !== true && value !== false) fail(table, field);
};
const unit = (row: Row, table: string) => { if (row.unit !== undefined && row.unit !== 'reps' && row.unit !== 'seconds') fail(table, 'unit'); };

/** Field-level checks from docs/data-contract.md. Any violation rejects the whole file. */
function validateRows(tables: BackupTables) {
  for (const table of TABLES) {
    const seen = new Set<string>();
    for (const row of tables[table] as unknown as Row[]) {
      if (seen.has(row.id as string)) throw new Error(`备份内容已损坏：${table} 中有重复的 id。`);
      seen.add(row.id as string);
    }
  }
  const exerciseIds = new Set(tables.exercises.map(row => row.id));
  const planIds = new Set(tables.plans.map(row => row.id));
  const workoutIds = new Set(tables.workouts.map(row => row.id));
  for (const row of tables.exercises as unknown as Row[]) {
    text(row, 'exercises', 'name'); text(row, 'exercises', 'muscle'); text(row, 'exercises', 'equipment'); flag(row, 'exercises', 'isCustom');
  }
  for (const row of tables.plans as unknown as Row[]) {
    text(row, 'plans', 'name'); text(row, 'plans', 'note'); date(row, 'plans', 'createdAt');
  }
  for (const row of tables.plan_items as unknown as Row[]) {
    if (!planIds.has(row.planId as string)) fail('plan_items', 'planId');
    if (!exerciseIds.has(row.exerciseId as string)) fail('plan_items', 'exerciseId');
    integer(row, 'plan_items', 'sortOrder');
    integer(row, 'plan_items', 'sets');
    integer(row, 'plan_items', 'reps');
    number(row, 'plan_items', 'weight');
    integer(row, 'plan_items', 'restSeconds', true);
    unit(row, 'plan_items');
  }
  for (const row of tables.workouts as unknown as Row[]) {
    text(row, 'workouts', 'name'); text(row, 'workouts', 'note'); date(row, 'workouts', 'startedAt');
    if (row.endedAt !== null && row.endedAt !== undefined) date(row, 'workouts', 'endedAt');
    if (row.planId !== null && row.planId !== undefined && typeof row.planId !== 'string') fail('workouts', 'planId');
  }
  for (const row of tables.workout_sets as unknown as Row[]) {
    if (!workoutIds.has(row.workoutId as string)) fail('workout_sets', 'workoutId');
    if (!exerciseIds.has(row.exerciseId as string)) fail('workout_sets', 'exerciseId');
    integer(row, 'workout_sets', 'sortOrder');
    integer(row, 'workout_sets', 'setNumber');
    integer(row, 'workout_sets', 'reps');
    number(row, 'workout_sets', 'weight');
    integer(row, 'workout_sets', 'restSeconds', true);
    flag(row, 'workout_sets', 'completed');
    unit(row, 'workout_sets');
    if (row.kind !== undefined && row.kind !== 'working' && row.kind !== 'warmup') fail('workout_sets', 'kind');
    if (row.rpe !== undefined && row.rpe !== null && !isRpe(row.rpe)) fail('workout_sets', 'rpe');
  }
  for (const row of tables.body_entries as unknown as Row[]) {
    date(row, 'body_entries', 'recordedAt');
    number(row, 'body_entries', 'weight');
    if (row.bodyFat !== null && row.bodyFat !== undefined) number(row, 'body_entries', 'bodyFat');
  }
  for (const row of tables.food_entries as unknown as Row[]) {
    date(row, 'food_entries', 'loggedAt'); text(row, 'food_entries', 'meal'); text(row, 'food_entries', 'name'); text(row, 'food_entries', 'portion');
    for (const field of ['calories', 'protein', 'carbs', 'fat']) number(row, 'food_entries', field);
  }
}

export async function exportBackup(db: SQLiteDatabase): Promise<BackupFile> {
  const [exercises, plans, plan_items, workouts, workout_sets, body_entries, food_entries, weeklyGoal, scheduleRows, favorites, preferences] = await Promise.all([
    db.getAllAsync<Exercise>('SELECT * FROM exercises'),
    db.getAllAsync<Plan>('SELECT * FROM plans'),
    db.getAllAsync<PlanItem>('SELECT * FROM plan_items'),
    db.getAllAsync<Workout>('SELECT * FROM workouts'),
    db.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets'),
    db.getAllAsync<BodyEntry>('SELECT * FROM body_entries'),
    db.getAllAsync<FoodEntry>('SELECT * FROM food_entries'),
    readWeeklyGoal(db),
    readTrainingSchedule(db),
    readFavoritePlanIds(db),
    readPreferences(db),
  ]);
  // Only include assignments whose plans were captured by the parallel reads.
  const planIds = new Set(plans.map(plan => plan.id));
  const schedule = scheduleRows.filter(entry => planIds.has(entry.planId));
  const favoritePlanIds = favorites.filter(planId => planIds.has(planId));
  return { app: 'lianji', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables: { exercises, plans, plan_items, workouts, workout_sets, body_entries, food_entries }, weeklyGoal, schedule, favoritePlanIds, preferences };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON。');
  }
  const backup = data as Partial<BackupFile> | null;
  if (backup?.app !== 'lianji' || !backup.tables) throw new Error('这不是练迹的备份文件。');
  if (backup.version !== BACKUP_VERSION) throw new Error(`备份版本（${backup.version}）与当前应用（${BACKUP_VERSION}）不兼容。`);
  if (backup.weeklyGoal !== undefined && !isWeeklyGoal(backup.weeklyGoal)) throw new Error('备份中的每周训练目标无效。');
  for (const table of TABLES) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows)) throw new Error(`备份缺少 ${table} 数据。`);
    for (const row of rows as { id?: unknown }[]) {
      if (typeof row?.id !== 'string' || !row.id) throw new Error('备份内容已损坏：存在缺少 id 的记录。');
    }
  }
  validateRows(backup.tables);
  validateSchedule(backup.schedule, backup.tables.plans);
  validateFavoritePlanIds(backup.favoritePlanIds, backup.tables.plans);
  validatePreferences(backup.preferences);
  return backup as BackupFile;
}

const bit = (value: unknown) => value === true || value === 1 ? 1 : 0;

async function insertPlanItem(db: SQLiteDatabase, item: PlanItem, itemId = item.id) {
  await db.runAsync('INSERT INTO plan_items (id, planId, exerciseId, sortOrder, sets, reps, weight, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    itemId, item.planId, item.exerciseId, item.sortOrder, item.sets, item.reps, item.weight, item.unit ?? 'reps', item.restSeconds ?? 90);
}

async function insertWorkoutSet(db: SQLiteDatabase, set: WorkoutSet, setId = set.id) {
  await db.runAsync('INSERT INTO workout_sets (id, workoutId, exerciseId, sortOrder, setNumber, weight, reps, completed, unit, restSeconds, kind, rpe) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    setId, set.workoutId, set.exerciseId, set.sortOrder, set.setNumber, set.weight, set.reps, bit(set.completed), set.unit ?? 'reps', set.restSeconds ?? 90, set.kind ?? 'working', set.rpe ?? null);
}

async function saveSnapshot(db: SQLiteDatabase, reason: RestoreMode) {
  const payload = JSON.stringify(await exportBackup(db));
  await db.runAsync('INSERT INTO backup_snapshots (id, createdAt, reason, payload) VALUES (?, ?, ?, ?)', newId(), new Date().toISOString(), reason, payload);
  await db.runAsync(`DELETE FROM backup_snapshots WHERE id NOT IN (
    SELECT id FROM backup_snapshots ORDER BY createdAt DESC, rowid DESC LIMIT ${SNAPSHOT_LIMIT}
  )`);
}

async function replaceAll(transaction: SQLiteDatabase, backup: BackupFile) {
  const tables = normalizeExerciseRows(backup.tables);
  const planIds = new Set(tables.plans.map(plan => plan.id));
  if (backup.weeklyGoal !== undefined) await writeWeeklyGoal(transaction, backup.weeklyGoal);
  if (backup.preferences) await writePreferences(transaction, backup.preferences);
  for (const table of DELETE_ORDER) await transaction.runAsync(`DELETE FROM ${table}`);
  for (const exercise of tables.exercises) {
    await transaction.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, ?)', exercise.id, exercise.name, exercise.muscle, exercise.equipment, bit(exercise.isCustom));
  }
  for (const plan of tables.plans) {
    await transaction.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', plan.id, plan.name, plan.note, plan.createdAt);
  }
  for (const planId of backup.favoritePlanIds ?? []) {
    await transaction.runAsync('INSERT INTO plan_favorites (planId) VALUES (?)', planId);
  }
  for (const entry of backup.schedule ?? []) {
    await insertScheduledTraining(transaction, entry.day, entry.planId);
  }
  for (const item of tables.plan_items) await insertPlanItem(transaction, item);
  for (const workout of tables.workouts) {
    // Other devices may keep a reference to a plan they already deleted.
    const planId = workout.planId && planIds.has(workout.planId) ? workout.planId : null;
    await transaction.runAsync('INSERT INTO workouts VALUES (?, ?, ?, ?, ?, ?)', workout.id, planId, workout.name, workout.startedAt, workout.endedAt ?? null, workout.note);
  }
  for (const set of tables.workout_sets) await insertWorkoutSet(transaction, set);
  for (const entry of tables.body_entries) {
    await transaction.runAsync('INSERT INTO body_entries VALUES (?, ?, ?, ?)', entry.id, entry.recordedAt, entry.weight, entry.bodyFat ?? null);
  }
  for (const entry of tables.food_entries) {
    await transaction.runAsync('INSERT INTO food_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', entry.id, entry.loggedAt, entry.meal, entry.name, entry.portion, entry.calories, entry.protein, entry.carbs, entry.fat);
  }
}

/** Replaces all local data with the backup. A snapshot of the current data is kept for undo. */
export async function importBackup(db: SQLiteDatabase, backup: BackupFile, { snapshot = true } = {}): Promise<void> {
  validateSchedule(backup.schedule, backup.tables.plans);
  validateFavoritePlanIds(backup.favoritePlanIds, backup.tables.plans);
  validatePreferences(backup.preferences);
  await withWriteTransaction(db, async transaction => {
    if (snapshot) await saveSnapshot(transaction, 'replace');
    await replaceAll(transaction, backup);
  });
}

/** Adds records this device does not have yet. Existing records always keep the local version. */
export async function mergeBackup(db: SQLiteDatabase, backup: BackupFile): Promise<MergeSummary> {
  validateSchedule(backup.schedule, backup.tables.plans);
  validateFavoritePlanIds(backup.favoritePlanIds, backup.tables.plans);
  validatePreferences(backup.preferences);
  const summary: MergeSummary = { exercises: 0, plans: 0, workouts: 0, bodyEntries: 0, foodEntries: 0, schedule: 0, favorites: 0 };
  await withWriteTransaction(db, async transaction => {
    await saveSnapshot(transaction, 'merge');
    const tables = normalizeExerciseRows(backup.tables);
    const ids = async (table: string) => new Set((await transaction.getAllAsync<{ id: string }>(`SELECT id FROM ${table}`)).map(row => row.id));

    const localExercises = await transaction.getAllAsync<Exercise>('SELECT * FROM exercises');
    const exerciseIds = new Set(localExercises.map(exercise => exercise.id));
    const customByName = new Map(localExercises.filter(exercise => exercise.isCustom).map(exercise => [exercise.name, exercise.id]));
    const remap = new Map<string, string>();
    for (const exercise of tables.exercises) {
      if (exerciseIds.has(exercise.id)) continue;
      const sameName = bit(exercise.isCustom) ? customByName.get(exercise.name) : undefined;
      if (sameName) { remap.set(exercise.id, sameName); continue; }
      await transaction.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, ?)', exercise.id, exercise.name, exercise.muscle, exercise.equipment, bit(exercise.isCustom));
      exerciseIds.add(exercise.id);
      summary.exercises++;
    }
    const exerciseFor = (exerciseId: string) => remap.get(exerciseId) ?? exerciseId;

    const planIds = await ids('plans');
    const itemIds = await ids('plan_items');
    for (const plan of tables.plans) {
      if (planIds.has(plan.id)) continue;
      await transaction.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', plan.id, plan.name, plan.note, plan.createdAt);
      planIds.add(plan.id);
      for (const item of tables.plan_items.filter(entry => entry.planId === plan.id)) {
        const itemId = itemIds.has(item.id) ? newId() : item.id;
        itemIds.add(itemId);
        await insertPlanItem(transaction, { ...item, exerciseId: exerciseFor(item.exerciseId) }, itemId);
      }
      summary.plans++;
    }

    const workoutIds = await ids('workouts');
    const setIds = await ids('workout_sets');
    for (const workout of tables.workouts) {
      if (!workout.endedAt || workoutIds.has(workout.id)) continue;
      const planId = workout.planId && planIds.has(workout.planId) ? workout.planId : null;
      await transaction.runAsync('INSERT INTO workouts VALUES (?, ?, ?, ?, ?, ?)', workout.id, planId, workout.name, workout.startedAt, workout.endedAt, workout.note);
      workoutIds.add(workout.id);
      for (const set of tables.workout_sets.filter(entry => entry.workoutId === workout.id)) {
        const setId = setIds.has(set.id) ? newId() : set.id;
        setIds.add(setId);
        await insertWorkoutSet(transaction, { ...set, exerciseId: exerciseFor(set.exerciseId) }, setId);
      }
      summary.workouts++;
    }

    const bodyIds = await ids('body_entries');
    for (const entry of tables.body_entries) {
      if (bodyIds.has(entry.id)) continue;
      await transaction.runAsync('INSERT INTO body_entries VALUES (?, ?, ?, ?)', entry.id, entry.recordedAt, entry.weight, entry.bodyFat ?? null);
      summary.bodyEntries++;
    }
    const foodIds = await ids('food_entries');
    for (const entry of tables.food_entries) {
      if (foodIds.has(entry.id)) continue;
      await transaction.runAsync('INSERT INTO food_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', entry.id, entry.loggedAt, entry.meal, entry.name, entry.portion, entry.calories, entry.protein, entry.carbs, entry.fat);
      summary.foodEntries++;
    }

    for (const entry of backup.schedule ?? []) {
      if (!planIds.has(entry.planId)) continue;
      const result = await transaction.runAsync('INSERT INTO training_schedule (day, planId) VALUES (?, ?) ON CONFLICT(day, planId) DO NOTHING', entry.day, entry.planId);
      summary.schedule += result.changes;
    }
    for (const planId of backup.favoritePlanIds ?? []) {
      if (!planIds.has(planId)) continue;
      const result = await transaction.runAsync('INSERT INTO plan_favorites (planId) VALUES (?) ON CONFLICT(planId) DO NOTHING', planId);
      summary.favorites += result.changes;
    }

    if (backup.weeklyGoal && !(await readWeeklyGoal(transaction))) await writeWeeklyGoal(transaction, backup.weeklyGoal);
    if (backup.preferences) {
      const stored = new Set((await transaction.getAllAsync<{ key: string }>("SELECT key FROM app_settings WHERE key LIKE 'pref.%'")).map(row => row.key));
      const local = await readPreferences(transaction);
      const { weightUnit, calorieGoal, proteinGoal } = backup.preferences;
      await writePreferences(transaction, {
        weightUnit: weightUnit && !stored.has('pref.weightUnit') ? weightUnit : undefined,
        calorieGoal: calorieGoal && !local.calorieGoal ? calorieGoal : undefined,
        proteinGoal: proteinGoal && !local.proteinGoal ? proteinGoal : undefined,
      });
    }
  });
  return summary;
}

export function mergeSummaryLabel(summary: MergeSummary) {
  const parts = [
    summary.workouts && `${summary.workouts} 次训练`,
    summary.plans && `${summary.plans} 个计划`,
    summary.exercises && `${summary.exercises} 个动作`,
    summary.bodyEntries && `${summary.bodyEntries} 条身体记录`,
    summary.foodEntries && `${summary.foodEntries} 条饮食记录`,
    summary.schedule && `${summary.schedule} 项训练安排`,
    summary.favorites && `${summary.favorites} 个收藏`,
  ].filter(Boolean);
  return parts.length ? `新增 ${parts.join('、')}。` : '备份中的记录本机都已存在，没有新增内容。';
}

export async function latestSnapshot(db: SQLiteDatabase): Promise<SnapshotInfo | null> {
  return db.getFirstAsync<SnapshotInfo>('SELECT id, createdAt, reason FROM backup_snapshots ORDER BY createdAt DESC, rowid DESC LIMIT 1');
}

/** Restores the data from before the most recent import and discards that snapshot. */
export async function undoLastImport(db: SQLiteDatabase) {
  await withWriteTransaction(db, async transaction => {
    const snapshot = await transaction.getFirstAsync<{ id: string; payload: string }>('SELECT id, payload FROM backup_snapshots ORDER BY createdAt DESC, rowid DESC LIMIT 1');
    if (!snapshot) throw new Error('没有可以撤销的导入。');
    await replaceAll(transaction, parseBackup(snapshot.payload));
    await transaction.runAsync('DELETE FROM backup_snapshots WHERE id = ?', snapshot.id);
  });
}
