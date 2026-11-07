import { withWriteTransaction } from './write-transaction';
import type { SQLiteDatabase } from 'expo-sqlite';
import extraExercises from '../../assets/exercises/extra-exercises.json';
import { isScheduleDay, type ScheduledTraining } from './training-schedule';
import { id } from './types';

const defaultExercises: [string, string, string][] = [
  ['杠铃卧推', '胸', '杠铃'], ['上斜哑铃卧推', '胸', '哑铃'], ['双杠臂屈伸', '胸', '自重'],
  ['绳索夹胸', '胸', '绳索'], ['俯卧撑', '胸', '自重'], ['引体向上', '背', '自重'],
  ['杠铃划船', '背', '杠铃'], ['高位下拉', '背', '器械'], ['坐姿划船', '背', '器械'],
  ['单臂哑铃划船', '背', '哑铃'], ['杠铃深蹲', '腿', '杠铃'], ['腿举', '腿', '器械'],
  ['罗马尼亚硬拉', '腿', '杠铃'], ['保加利亚分腿蹲', '腿', '哑铃'], ['腿屈伸', '腿', '器械'],
  ['腿弯举', '腿', '器械'], ['站姿提踵', '腿', '器械'], ['杠铃肩推', '肩', '杠铃'],
  ['哑铃侧平举', '肩', '哑铃'], ['反向飞鸟', '肩', '哑铃'], ['面拉', '肩', '绳索'],
  ['杠铃弯举', '手臂', '杠铃'], ['锤式弯举', '手臂', '哑铃'], ['绳索下压', '手臂', '绳索'],
  ['仰卧臂屈伸', '手臂', '杠铃'], ['平板支撑', '核心', '自重'], ['卷腹', '核心', '自重'],
  ['悬垂举腿', '核心', '自重'], ['硬拉', '全身', '杠铃'], ['壶铃摆动', '全身', '壶铃'],
];

export function isWeeklyGoal(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 7;
}

export async function readWeeklyGoal(db: SQLiteDatabase) {
  const preferences = await db.getFirstAsync<{ weeklyGoal: number }>('SELECT weeklyGoal FROM training_preferences WHERE id = 1');
  return preferences?.weeklyGoal ?? 0;
}

export async function writeWeeklyGoal(db: SQLiteDatabase, days: number) {
  if (!isWeeklyGoal(days)) throw new Error('每周训练目标需为 0–7 天的整数。');
  await db.runAsync(`
    INSERT INTO training_preferences (id, weeklyGoal) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET weeklyGoal = excluded.weeklyGoal
  `, days);
}

export async function readTrainingSchedule(db: SQLiteDatabase) {
  return db.getAllAsync<ScheduledTraining>('SELECT day, planId FROM training_schedule ORDER BY day, planId');
}

export async function insertScheduledTraining(db: SQLiteDatabase, day: string, planId: string) {
  if (!isScheduleDay(day)) throw new Error('请选择有效的训练日期。');
  // An existing pair still reports a change, so zero changes means the plan is missing.
  const result = await db.runAsync(`
    INSERT INTO training_schedule (day, planId)
    SELECT ?, id FROM plans WHERE id = ?
    ON CONFLICT(day, planId) DO UPDATE SET planId = excluded.planId
  `, day, planId);
  if (!result.changes) throw new Error('没有找到这个训练计划。');
}

export async function removeScheduledTraining(db: SQLiteDatabase, day: string, planId: string) {
  if (!isScheduleDay(day)) throw new Error('请选择有效的训练日期。');
  await db.runAsync('DELETE FROM training_schedule WHERE day = ? AND planId = ?', day, planId);
}

export async function readFavoritePlanIds(db: SQLiteDatabase) {
  const favorites = await db.getAllAsync<{ planId: string }>('SELECT planId FROM plan_favorites ORDER BY planId');
  return favorites.map(item => item.planId);
}

export async function writePlanFavorite(db: SQLiteDatabase, planId: string, favorite: boolean) {
  if (typeof favorite !== 'boolean') throw new Error('收藏状态无效。');
  await withWriteTransaction(db, async transaction => {
    const plan = await transaction.getFirstAsync<{ id: string }>('SELECT id FROM plans WHERE id = ?', planId);
    if (!plan) throw new Error('没有找到这个训练计划。');
    if (favorite) {
      await transaction.runAsync('INSERT INTO plan_favorites (planId) VALUES (?) ON CONFLICT(planId) DO NOTHING', planId);
    } else {
      await transaction.runAsync('DELETE FROM plan_favorites WHERE planId = ?', planId);
    }
  });
}

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, muscle TEXT NOT NULL,
      equipment TEXT NOT NULL, isCustom INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS training_schedule (
      day TEXT NOT NULL, planId TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      PRIMARY KEY (day, planId)
    );
    CREATE TABLE IF NOT EXISTS plan_favorites (
      planId TEXT PRIMARY KEY NOT NULL REFERENCES plans(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS plan_items (
      id TEXT PRIMARY KEY NOT NULL, planId TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      exerciseId TEXT NOT NULL REFERENCES exercises(id), sortOrder INTEGER NOT NULL,
      sets INTEGER NOT NULL, reps INTEGER NOT NULL, weight REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL, planId TEXT REFERENCES plans(id) ON DELETE SET NULL,
      name TEXT NOT NULL, startedAt TEXT NOT NULL, endedAt TEXT, note TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workout_sets (
      id TEXT PRIMARY KEY NOT NULL, workoutId TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exerciseId TEXT NOT NULL REFERENCES exercises(id), sortOrder INTEGER NOT NULL,
      setNumber INTEGER NOT NULL, weight REAL NOT NULL, reps INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS body_entries (
      id TEXT PRIMARY KEY NOT NULL, recordedAt TEXT NOT NULL,
      weight REAL NOT NULL, bodyFat REAL
    );
    CREATE TABLE IF NOT EXISTS food_entries (
      id TEXT PRIMARY KEY NOT NULL, loggedAt TEXT NOT NULL, meal TEXT NOT NULL,
      name TEXT NOT NULL, portion TEXT NOT NULL, calories REAL NOT NULL,
      protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS training_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      weeklyGoal INTEGER NOT NULL CHECK (typeof(weeklyGoal) = 'integer' AND weeklyGoal BETWEEN 0 AND 7)
    );
    CREATE INDEX IF NOT EXISTS idx_workout_sets_workout ON workout_sets(workoutId);
    CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(startedAt);
    CREATE INDEX IF NOT EXISTS idx_food_logged ON food_entries(loggedAt);
    CREATE INDEX IF NOT EXISTS idx_training_schedule_plan ON training_schedule(planId);
  `);

  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM exercises');
  await db.withTransactionAsync(async () => {
    for (const table of ['plan_items', 'workout_sets']) {
      const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      if (!columns.some(column => column.name === 'unit')) {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN unit TEXT NOT NULL DEFAULT 'reps'`);
      }
      if (!columns.some(column => column.name === 'restSeconds')) {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN restSeconds INTEGER NOT NULL DEFAULT 90`);
      }
    }
    for (const exercise of extraExercises) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ? AND isCustom = 0', exercise.name);
      if (!existing) await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 0)', `builtin:${exercise.id}`, exercise.name, exercise.muscle, exercise.equipment);
    }
    if (count?.count) return;
    for (const [name, muscle, equipment] of defaultExercises) {
      await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 0)', id(), name, muscle, equipment);
    }
    const templates: [string, string, string[]][] = [
      ['推日 · 胸肩三头', '适合上肢推力训练', ['杠铃卧推', '上斜哑铃卧推', '杠铃肩推', '哑铃侧平举', '绳索下压']],
      ['拉日 · 背部二头', '适合上肢拉力训练', ['引体向上', '杠铃划船', '高位下拉', '面拉', '杠铃弯举']],
      ['腿日 · 下肢核心', '适合下肢力量训练', ['杠铃深蹲', '罗马尼亚硬拉', '腿举', '腿弯举', '平板支撑']],
    ];
    for (const [name, note, names] of templates) {
      const planId = id();
      await db.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', planId, name, note, new Date().toISOString());
      for (let i = 0; i < names.length; i++) {
        const exercise = await db.getFirstAsync<{ id: string }>('SELECT id FROM exercises WHERE name = ?', names[i]);
        if (exercise) await db.runAsync('INSERT INTO plan_items (id, planId, exerciseId, sortOrder, sets, reps, weight, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id(), planId, exercise.id, i, 3, 10, 0, names[i] === '平板支撑' ? 'seconds' : 'reps');
      }
    }
  });
}
