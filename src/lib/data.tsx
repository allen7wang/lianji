import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { importPlanTemplate } from './import-plan-template';
import { defaultUnit } from './training-target';
import { appendWorkoutSet, startWorkoutFromPlan } from './workout-storage';
import { id, type BodyEntry, type Exercise, type FoodEntry, type Plan, type PlanDraftItem, type PlanItem, type Workout, type WorkoutSet } from './types';

type Data = {
  ready: boolean;
  exercises: Exercise[];
  plans: Plan[];
  planItems: PlanItem[];
  workouts: Workout[];
  workoutSets: WorkoutSet[];
  bodyEntries: BodyEntry[];
  foodEntries: FoodEntry[];
  refresh: () => Promise<void>;
  savePlan: (name: string, note: string, items: PlanDraftItem[], planId?: string) => Promise<string>;
  deletePlan: (planId: string) => Promise<void>;
  addProgramTemplate: (programId: string) => Promise<number>;
  addExercise: (name: string, muscle: string, equipment: string) => Promise<string>;
  startWorkout: (planId?: string) => Promise<string>;
  addWorkoutExercise: (workoutId: string, exerciseId: string) => Promise<void>;
  addSet: (workoutId: string, exerciseId: string) => Promise<void>;
  updateSet: (setId: string, patch: Partial<Pick<WorkoutSet, 'weight' | 'reps' | 'completed'>>) => Promise<void>;
  deleteSet: (setId: string) => Promise<void>;
  finishWorkout: (workoutId: string, note: string) => Promise<void>;
  updateWorkoutNote: (workoutId: string, note: string) => Promise<void>;
  deleteWorkout: (workoutId: string) => Promise<void>;
  addBodyEntry: (weight: number, bodyFat: number | null) => Promise<void>;
  deleteBodyEntry: (entryId: string) => Promise<void>;
  addFoodEntry: (entry: Omit<FoodEntry, 'id' | 'loggedAt'>) => Promise<void>;
  deleteFoodEntry: (entryId: string) => Promise<void>;
};

const DataContext = createContext<Data | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [workoutSets, setWorkoutSets] = useState<WorkoutSet[]>([]);
  const [bodyEntries, setBodyEntries] = useState<BodyEntry[]>([]);
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);

  const refresh = useCallback(async () => {
    const [nextExercises, nextPlans, nextPlanItems, nextWorkouts, nextSets, nextBody, nextFood] = await Promise.all([
      db.getAllAsync<Exercise>('SELECT * FROM exercises ORDER BY isCustom, name'),
      db.getAllAsync<Plan>('SELECT * FROM plans ORDER BY createdAt DESC'),
      db.getAllAsync<PlanItem>('SELECT * FROM plan_items ORDER BY sortOrder'),
      db.getAllAsync<Workout>('SELECT * FROM workouts ORDER BY startedAt DESC'),
      db.getAllAsync<WorkoutSet>('SELECT * FROM workout_sets ORDER BY sortOrder, setNumber'),
      db.getAllAsync<BodyEntry>('SELECT * FROM body_entries ORDER BY recordedAt DESC'),
      db.getAllAsync<FoodEntry>('SELECT * FROM food_entries ORDER BY loggedAt DESC'),
    ]);
    setExercises(nextExercises);
    setPlans(nextPlans);
    setPlanItems(nextPlanItems);
    setWorkouts(nextWorkouts);
    setWorkoutSets(nextSets);
    setBodyEntries(nextBody);
    setFoodEntries(nextFood);
    setReady(true);
  }, [db]);

  useEffect(() => {
    const timer = setTimeout(() => { refresh().catch(console.error); }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const value = useMemo<Data>(() => ({
    ready, exercises, plans, planItems, workouts, workoutSets, bodyEntries, foodEntries, refresh,
    async addProgramTemplate(programId) {
      const added = await importPlanTemplate(db, programId);
      await refresh();
      return added;
    },
    async savePlan(name, note, items, planId) {
      const nextId = planId ?? id();
      await db.withTransactionAsync(async () => {
        if (planId) {
          await db.runAsync('UPDATE plans SET name = ?, note = ? WHERE id = ?', name.trim(), note.trim(), planId);
          await db.runAsync('DELETE FROM plan_items WHERE planId = ?', planId);
        } else {
          await db.runAsync('INSERT INTO plans VALUES (?, ?, ?, ?)', nextId, name.trim(), note.trim(), new Date().toISOString());
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await db.runAsync('INSERT INTO plan_items (id, planId, exerciseId, sortOrder, sets, reps, weight, unit, restSeconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id(), nextId, item.exerciseId, i, item.sets, item.reps, item.weight, item.unit ?? 'reps', item.restSeconds ?? 90);
        }
      });
      await refresh();
      return nextId;
    },
    async deletePlan(planId) {
      await db.runAsync('DELETE FROM plans WHERE id = ?', planId);
      await refresh();
    },
    async addExercise(name, muscle, equipment) {
      const nextId = id();
      await db.runAsync('INSERT INTO exercises VALUES (?, ?, ?, ?, 1)', nextId, name.trim(), muscle, equipment.trim());
      await refresh();
      return nextId;
    },
    async startWorkout(planId) {
      const nextId = await startWorkoutFromPlan(db, planId);
      await refresh();
      return nextId;
    },
    async addWorkoutExercise(workoutId, exerciseId) {
      const nextOrder = (await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sortOrder), -1) + 1 AS n FROM workout_sets WHERE workoutId = ?', workoutId))?.n ?? 0;
      const unit = defaultUnit(exercises.find(item => item.id === exerciseId));
      await db.runAsync('INSERT INTO workout_sets (id, workoutId, exerciseId, sortOrder, setNumber, weight, reps, completed, unit) VALUES (?, ?, ?, ?, 1, 0, ?, 0, ?)', id(), workoutId, exerciseId, nextOrder, unit === 'seconds' ? 30 : 10, unit);
      await refresh();
    },
    async addSet(workoutId, exerciseId) {
      await appendWorkoutSet(db, workoutId, exerciseId);
      await refresh();
    },
    async updateSet(setId, patch) {
      const fields = Object.keys(patch).filter(key => ['weight', 'reps', 'completed'].includes(key)) as (keyof typeof patch)[];
      if (!fields.length) return;
      const values = fields.map(key => patch[key] as number);
      await db.runAsync(`UPDATE workout_sets SET ${fields.map(key => `${key} = ?`).join(', ')} WHERE id = ?`, ...values, setId);
      await refresh();
    },
    async deleteSet(setId) {
      await db.runAsync('DELETE FROM workout_sets WHERE id = ?', setId);
      await refresh();
    },
    async finishWorkout(workoutId, note) {
      await db.runAsync('UPDATE workouts SET endedAt = ?, note = ? WHERE id = ?', new Date().toISOString(), note.trim(), workoutId);
      await refresh();
    },
    async updateWorkoutNote(workoutId, note) {
      await db.runAsync('UPDATE workouts SET note = ? WHERE id = ?', note, workoutId);
    },
    async deleteWorkout(workoutId) {
      await db.runAsync('DELETE FROM workouts WHERE id = ?', workoutId);
      await refresh();
    },
    async addBodyEntry(weight, bodyFat) {
      await db.runAsync('INSERT INTO body_entries VALUES (?, ?, ?, ?)', id(), new Date().toISOString(), weight, bodyFat);
      await refresh();
    },
    async deleteBodyEntry(entryId) {
      await db.runAsync('DELETE FROM body_entries WHERE id = ?', entryId);
      await refresh();
    },
    async addFoodEntry(entry) {
      await db.runAsync('INSERT INTO food_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id(), new Date().toISOString(), entry.meal, entry.name.trim(), entry.portion.trim(), entry.calories, entry.protein, entry.carbs, entry.fat);
      await refresh();
    },
    async deleteFoodEntry(entryId) {
      await db.runAsync('DELETE FROM food_entries WHERE id = ?', entryId);
      await refresh();
    },
  }), [ready, exercises, plans, planItems, workouts, workoutSets, bodyEntries, foodEntries, refresh, db]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used inside DataProvider');
  return context;
}
