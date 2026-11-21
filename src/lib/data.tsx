import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { exportBackup, importBackup, latestSnapshot, mergeBackup, undoLastImport, type BackupFile, type MergeSummary, type RestoreMode, type SnapshotInfo } from './backup';
import { insertScheduledTraining, readDeviceSettings, readFavoritePlanIds, readPreferences, readTrainingSchedule, readWeeklyGoal, removeScheduledTraining, writeDeviceSettings, writePlanFavorite, writePreferences, writeWeeklyGoal } from './database';
import { saveHealthBodyEntry, saveHealthWorkout } from './health';
import { importPlanTemplate } from './import-plan-template';
import type { FoodTemplate } from './nutrition';
import type { ScheduledTraining } from './training-schedule';
import { withWriteTransaction } from './write-transaction';
import { addWorkoutExercise, appendWorkoutSet, applyWorkoutWeight, deleteWorkoutSet, editFinishedWorkout, finishActiveWorkout, moveWorkoutExercise, repeatWorkoutFromHistory, replaceWorkoutExercise, reusePreviousWorkoutSet, setWorkoutSetKind, startWorkoutFromPlan, updateWorkoutSet, type FinishedWorkoutEdit, type SetPatch } from './workout-storage';
import { defaultDeviceSettings, defaultPreferences, id, volumeOf, type BodyEntry, type DeviceSettings, type Exercise, type FoodEntry, type Plan, type PlanDraftItem, type PlanItem, type Preferences, type SetKind, type Workout, type WorkoutSet } from './types';

export type LibraryState = {
  ready: boolean;
  exercises: Exercise[];
  plans: Plan[];
  planItems: PlanItem[];
  favoritePlanIds: string[];
  schedule: ScheduledTraining[];
  weeklyGoal: number;
  preferences: Preferences;
  deviceSettings: DeviceSettings;
  snapshot: SnapshotInfo | null;
};

/** Finished workouts (newest first) and their sets. Changes only when history changes. */
export type HistoryState = { workouts: Workout[]; sets: WorkoutSet[] };

/** The unfinished workout, if any. `pending` names the structural change in progress. */
export type ActiveState = { workout: Workout | null; sets: WorkoutSet[]; pending: string | null };

export type WellnessState = { bodyEntries: BodyEntry[]; foodEntries: FoodEntry[] };

export type Actions = {
  setWeeklyGoal: (days: number) => Promise<void>;
  setPreferences: (patch: Partial<Preferences>) => Promise<void>;
  setDeviceSettings: (patch: Partial<DeviceSettings>) => Promise<void>;
  schedulePlan: (day: string, planId: string) => Promise<void>;
  unschedulePlan: (day: string, planId: string) => Promise<void>;
  setPlanFavorite: (planId: string, favorite: boolean) => Promise<void>;
  addProgramTemplate: (programId: string) => Promise<number>;
  savePlan: (name: string, note: string, items: PlanDraftItem[], planId?: string) => Promise<string>;
  deletePlan: (planId: string) => Promise<void>;
  addExercise: (name: string, muscle: string, equipment: string) => Promise<string>;

  startWorkout: (planId?: string) => Promise<string>;
  repeatWorkout: (workoutId: string) => Promise<string | null>;
  discardWorkout: (workoutId: string) => Promise<void>;
  addWorkoutExercise: (workoutId: string, exerciseId: string) => Promise<void>;
  replaceWorkoutExercise: (workoutId: string, exerciseId: string, replacementId: string, expectedSetIds?: string[]) => Promise<void>;
  moveWorkoutExercise: (workoutId: string, exerciseId: string, direction: -1 | 1, expectedExerciseIds: string[]) => Promise<void>;
  addSet: (workoutId: string, exerciseId: string, kind?: SetKind) => Promise<void>;
  updateSet: (setId: string, patch: SetPatch) => Promise<void>;
  setSetKind: (setId: string, kind: SetKind) => Promise<void>;
  deleteSet: (setId: string) => Promise<void>;
  reusePreviousSet: (setId: string, sourceSetId: string) => Promise<{ weight: number; reps: number }>;
  applyWeight: (workoutId: string, exerciseId: string, weight: number) => Promise<number>;
  updateWorkoutNote: (workoutId: string, note: string) => Promise<void>;
  finishWorkout: (workoutId: string, note: string) => Promise<void>;

  editFinishedWorkout: (workoutId: string, edit: FinishedWorkoutEdit) => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<void>;

  addBodyEntry: (weight: number, bodyFat: number | null) => Promise<void>;
  deleteBodyEntry: (entryId: string) => Promise<void>;
  addFoodEntry: (entry: Omit<FoodEntry, 'id' | 'loggedAt'>) => Promise<void>;
  relogFood: (food: FoodTemplate, meal: string) => Promise<void>;
  deleteFoodEntry: (entryId: string) => Promise<void>;

  exportBackupData: () => Promise<BackupFile>;
  restoreBackup: (backup: BackupFile, mode: RestoreMode) => Promise<MergeSummary | null>;
  undoLastImport: () => Promise<void>;
};

const initialLibrary: LibraryState = {
  ready: false, exercises: [], plans: [], planItems: [], favoritePlanIds: [], schedule: [], weeklyGoal: 0,
  preferences: defaultPreferences, deviceSettings: defaultDeviceSettings, snapshot: null,
};

const LibraryContext = createContext<LibraryState | null>(null);
const HistoryContext = createContext<HistoryState | null>(null);
const ActiveContext = createContext<ActiveState | null>(null);
const WellnessContext = createContext<WellnessState | null>(null);
const ActionsContext = createContext<Actions | null>(null);

async function readLibrary(db: SQLiteDatabase): Promise<Omit<LibraryState, 'ready'>> {
  const [exercises, plans, planItems, favoritePlanIds, schedule, weeklyGoal, preferences, deviceSettings, snapshot] = await Promise.all([
    db.getAllAsync<Exercise>('SELECT * FROM exercises ORDER BY isCustom, name'),
    db.getAllAsync<Plan>('SELECT * FROM plans ORDER BY createdAt DESC'),
    db.getAllAsync<PlanItem>('SELECT * FROM plan_items ORDER BY sortOrder'),
    readFavoritePlanIds(db),
    readTrainingSchedule(db),
    readWeeklyGoal(db),
    readPreferences(db),
    readDeviceSettings(db),
    latestSnapshot(db),
  ]);
  return { exercises, plans, planItems, favoritePlanIds, schedule, weeklyGoal, preferences, deviceSettings, snapshot };
}

async function readHistory(db: SQLiteDatabase): Promise<HistoryState> {
  const [workouts, sets] = await Promise.all([
    db.getAllAsync<Workout>('SELECT * FROM workouts WHERE endedAt IS NOT NULL ORDER BY startedAt DESC'),
    db.getAllAsync<WorkoutSet>(`SELECT workout_sets.* FROM workout_sets JOIN workouts ON workouts.id = workout_sets.workoutId
      WHERE workouts.endedAt IS NOT NULL ORDER BY workout_sets.sortOrder, workout_sets.setNumber, workout_sets.id`),
  ]);
  return { workouts, sets };
}

async function readActive(db: SQLiteDatabase): Promise<Omit<ActiveState, 'pending'>> {
  const workout = await db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE endedAt IS NULL ORDER BY startedAt DESC LIMIT 1');
  const sets = workout ? await db.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ? ORDER BY sortOrder, setNumber, id', workout.id) : [];
  return { workout, sets };
}

async function readWellness(db: SQLiteDatabase): Promise<WellnessState> {
  const [bodyEntries, foodEntries] = await Promise.all([
    db.getAllAsync<BodyEntry>('SELECT * FROM body_entries ORDER BY recordedAt DESC'),
    db.getAllAsync<FoodEntry>('SELECT * FROM food_entries ORDER BY loggedAt DESC'),
  ]);
  return { bodyEntries, foodEntries };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [library, setLibrary] = useState<LibraryState>(initialLibrary);
  const [history, setHistory] = useState<HistoryState>({ workouts: [], sets: [] });
  const [active, setActive] = useState<Omit<ActiveState, 'pending'>>({ workout: null, sets: [] });
  const [pending, setPending] = useState<string | null>(null);
  const [wellness, setWellness] = useState<WellnessState>({ bodyEntries: [], foodEntries: [] });
  // Library reads are versioned so a slow older read never overwrites a newer one.
  const libraryRequest = useRef(0);
  const healthEnabled = useRef(false);
  useEffect(() => { healthEnabled.current = library.deviceSettings.healthSync; }, [library.deviceSettings.healthSync]);

  const actions = useMemo<Actions>(() => {
    const reloadLibrary = async () => {
      const request = ++libraryRequest.current;
      const next = await readLibrary(db);
      if (request === libraryRequest.current) setLibrary(current => ({ ...current, ...next }));
    };
    const reloadHistory = async () => setHistory(await readHistory(db));
    const pendingSetWrites = new Set<{ setId: string; patch: Partial<WorkoutSet> }>();
    const reloadActive = async () => {
      const next = await readActive(db);
      for (const { setId, patch } of pendingSetWrites) {
        next.sets = next.sets.map(set => set.id === setId ? { ...set, ...patch } : set);
      }
      setActive(next);
    };
    const reloadWellness = async () => setWellness(await readWellness(db));
    const reloadAll = () => Promise.all([reloadLibrary(), reloadHistory(), reloadActive(), reloadWellness()]).then(() => {});

    // Active-workout writes run one at a time, in the order they were requested.
    const writes: { tail: Promise<unknown> } = { tail: Promise.resolve() };
    const serial = <T,>(label: string | null, task: () => Promise<T>): Promise<T> => {
      const run = writes.tail.catch(() => {}).then(async () => {
        if (label) setPending(label);
        try { return await task(); } finally { if (label) setPending(null); }
      });
      writes.tail = run;
      return run;
    };
    const activeWrite = <T,>(label: string | null, task: () => Promise<T>) => serial(label, async () => {
      try { return await task(); } finally { await reloadActive(); }
    });
    const patchActiveSet = (setId: string, patch: Partial<WorkoutSet>, persist: () => Promise<void>) => {
      const change = { setId, patch };
      pendingSetWrites.add(change);
      setActive(current => ({ ...current, sets: current.sets.map(set => set.id === setId ? { ...set, ...patch } : set) }));
      return serial(null, async () => {
        try {
          await persist();
          pendingSetWrites.delete(change);
        } catch (error) {
          pendingSetWrites.delete(change);
          await reloadActive();
          throw error;
        }
      });
    };

    return {
      async setWeeklyGoal(days) { await writeWeeklyGoal(db, days); await reloadLibrary(); },
      async setPreferences(patch) { await writePreferences(db, patch); await reloadLibrary(); },
      async setDeviceSettings(patch) { await writeDeviceSettings(db, patch); await reloadLibrary(); },
      async schedulePlan(day, planId) { await insertScheduledTraining(db, day, planId); await reloadLibrary(); },
      async unschedulePlan(day, planId) { await removeScheduledTraining(db, day, planId); await reloadLibrary(); },
      async setPlanFavorite(planId, favorite) { await writePlanFavorite(db, planId, favorite); await reloadLibrary(); },
      async addProgramTemplate(programId) {
        const added = await importPlanTemplate(db, programId);
        await reloadLibrary();
        return added;
      },
      async savePlan(name, note, items, planId) {
        const nextId = planId ?? id();
        await withWriteTransaction(db, async transaction => {
          if (planId) {
            await transaction.runAsync('UPDATE plans SET name = ?, note = ? WHERE id = ?', name.trim(), note.trim(), planId);
            await transaction.runAsync('DELETE FROM plan_items WHERE planId = ?', planId);
          } else {
            await transaction.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', nextId, name.trim(), note.trim(), new Date().toISOString());
          }
          for (const [index, item] of items.entries()) {
            await transaction.runAsync('INSERT INTO plan_items (id, planId, exerciseId, sortOrder, sets, reps, weight, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id(), nextId, item.exerciseId, index, item.sets, item.reps, item.weight, item.unit ?? 'reps', item.restSeconds ?? 90);
          }
        });
        await reloadLibrary();
        return nextId;
      },
      async deletePlan(planId) {
        await db.runAsync('DELETE FROM plans WHERE id = ?', planId);
        await Promise.all([reloadLibrary(), reloadHistory(), reloadActive()]);
      },
      async addExercise(name, muscle, equipment) {
        const nextId = id();
        await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 1)', nextId, name.trim(), muscle, equipment.trim());
        await reloadLibrary();
        return nextId;
      },

      startWorkout: planId => activeWrite('正在开始训练…', () => startWorkoutFromPlan(db, planId)),
      repeatWorkout: workoutId => activeWrite('正在准备训练…', () => repeatWorkoutFromHistory(db, workoutId)),
      discardWorkout: workoutId => activeWrite('正在放弃训练…', async () => {
        await db.runAsync('DELETE FROM workouts WHERE id = ? AND endedAt IS NULL', workoutId);
      }),
      addWorkoutExercise: (workoutId, exerciseId) => activeWrite('正在添加动作…', () => addWorkoutExercise(db, workoutId, exerciseId)),
      replaceWorkoutExercise: (workoutId, exerciseId, replacementId, expectedSetIds) =>
        activeWrite('正在更换动作…', () => replaceWorkoutExercise(db, workoutId, exerciseId, replacementId, expectedSetIds)),
      moveWorkoutExercise: (workoutId, exerciseId, direction, expectedExerciseIds) =>
        activeWrite('正在调整顺序…', () => moveWorkoutExercise(db, workoutId, exerciseId, direction, expectedExerciseIds)),
      addSet: (workoutId, exerciseId, kind) => activeWrite(null, () => appendWorkoutSet(db, workoutId, exerciseId, kind)),
      updateSet: (setId, patch) => patchActiveSet(setId, patch, () => updateWorkoutSet(db, setId, patch)),
      setSetKind: (setId, kind) => patchActiveSet(setId, { kind }, () => setWorkoutSetKind(db, setId, kind)),
      deleteSet: setId => activeWrite(null, () => deleteWorkoutSet(db, setId)),
      reusePreviousSet: (setId, sourceSetId) => activeWrite('正在沿用上次…', () => reusePreviousWorkoutSet(db, setId, sourceSetId)),
      applyWeight: (workoutId, exerciseId, weight) => activeWrite('正在应用建议…', () => applyWorkoutWeight(db, workoutId, exerciseId, weight)),
      updateWorkoutNote: (workoutId, note) => serial(null, async () => {
        await db.runAsync('UPDATE workouts SET note = ? WHERE id = ? AND endedAt IS NULL', note, workoutId);
      }),
      finishWorkout(workoutId, note) {
        return serial('正在保存训练…', async () => {
          await finishActiveWorkout(db, workoutId, note);
          await Promise.all([reloadActive(), reloadHistory()]);
          if (healthEnabled.current) {
            void Promise.all([
              db.getFirstAsync<Workout>('SELECT * FROM workouts WHERE id = ?', workoutId),
              db.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets WHERE workoutId = ?', workoutId),
            ]).then(([workout, sets]) => {
              if (workout?.endedAt) {
                return saveHealthWorkout({ name: workout.name, startedAt: workout.startedAt, endedAt: workout.endedAt, volumeKg: volumeOf(sets), completedSets: sets.filter(set => set.completed).length });
              }
            }).catch(error => console.warn('Health workout sync failed', error));
          }
        });
      },

      async editFinishedWorkout(workoutId, edit) { await editFinishedWorkout(db, workoutId, edit); await reloadHistory(); },
      async deleteWorkout(workoutId) {
        await db.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
        await Promise.all([reloadHistory(), reloadActive()]);
      },

      async addBodyEntry(weight, bodyFat) {
        const recordedAt = new Date().toISOString();
        await db.runAsync('INSERT INTO body_entries VALUES (?, ?, ?, ?)', id(), recordedAt, weight, bodyFat);
        await reloadWellness();
        if (healthEnabled.current) saveHealthBodyEntry({ recordedAt, weight, bodyFat }).catch(error => console.warn('Health body sync failed', error));
      },
      async deleteBodyEntry(entryId) { await db.runAsync('DELETE FROM body_entries WHERE id = ?', entryId); await reloadWellness(); },
      async addFoodEntry(entry) {
        await db.runAsync('INSERT INTO food_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id(), new Date().toISOString(), entry.meal, entry.name.trim(), entry.portion.trim(), entry.calories, entry.protein, entry.carbs, entry.fat);
        await reloadWellness();
      },
      async relogFood(food, meal) {
        await db.runAsync('INSERT INTO food_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id(), new Date().toISOString(), meal, food.name, food.portion, food.calories, food.protein, food.carbs, food.fat);
        await reloadWellness();
      },
      async deleteFoodEntry(entryId) { await db.runAsync('DELETE FROM food_entries WHERE id = ?', entryId); await reloadWellness(); },

      exportBackupData: () => exportBackup(db),
      restoreBackup: (backup, mode) => serial('正在导入备份…', async () => {
        const summary = mode === 'merge' ? await mergeBackup(db, backup) : (await importBackup(db, backup), null);
        await reloadAll();
        return summary;
      }),
      undoLastImport: () => serial('正在恢复快照…', async () => {
        await undoLastImport(db);
        await reloadAll();
      }),
    };
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([readLibrary(db), readHistory(db), readActive(db), readWellness(db)]).then(([nextLibrary, nextHistory, nextActive, nextWellness]) => {
      if (cancelled) return;
      setLibrary({ ...nextLibrary, ready: true });
      setHistory(nextHistory);
      setActive(nextActive);
      setWellness(nextWellness);
    }).catch(console.error);
    return () => { cancelled = true; };
  }, [db]);

  const activeValue = useMemo(() => ({ ...active, pending }), [active, pending]);

  return <ActionsContext.Provider value={actions}>
    <LibraryContext.Provider value={library}>
      <HistoryContext.Provider value={history}>
        <ActiveContext.Provider value={activeValue}>
          <WellnessContext.Provider value={wellness}>{children}</WellnessContext.Provider>
        </ActiveContext.Provider>
      </HistoryContext.Provider>
    </LibraryContext.Provider>
  </ActionsContext.Provider>;
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} must be used inside DataProvider`);
  return value;
}

/** Exercises, plans, schedule, goals and settings. */
export const useLibrary = () => required(useContext(LibraryContext), 'useLibrary');
/** Finished workouts and their sets; unaffected by edits to the active workout. */
export const useHistory = () => required(useContext(HistoryContext), 'useHistory');
/** The workout in progress and its sets. */
export const useActiveWorkout = () => required(useContext(ActiveContext), 'useActiveWorkout');
/** Body and food entries. */
export const useWellness = () => required(useContext(WellnessContext), 'useWellness');
/** Stable write operations; components that only write never re-render from data changes. */
export const useActions = () => required(useContext(ActionsContext), 'useActions');
