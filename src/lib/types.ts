export type Exercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  isCustom: number;
};

export type TrainingUnit = 'reps' | 'seconds';
export type SetKind = 'working' | 'warmup';
export type WeightUnit = 'kg' | 'lb';
export const targetLabel = (value: number, unit?: TrainingUnit) => `${value} ${unit === 'seconds' ? '秒' : '次'}`;

export type Plan = {
  id: string;
  name: string;
  note: string;
  createdAt: string;
};

export type PlanItem = {
  id: string;
  planId: string;
  exerciseId: string;
  sortOrder: number;
  sets: number;
  reps: number;
  weight: number;
  unit?: TrainingUnit;
  restSeconds?: number;
};

export type Workout = {
  id: string;
  planId: string | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  note: string;
};

export type WorkoutSet = {
  id: string;
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
  setNumber: number;
  weight: number;
  reps: number;
  completed: number;
  unit?: TrainingUnit;
  restSeconds?: number;
  kind?: SetKind;
  rpe?: number | null;
};

export type BodyEntry = {
  id: string;
  recordedAt: string;
  weight: number;
  bodyFat: number | null;
};

export type FoodEntry = {
  id: string;
  loggedAt: string;
  meal: string;
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Synced with backups. Goals use 0 for "not set". */
export type Preferences = {
  weightUnit: WeightUnit;
  calorieGoal: number;
  proteinGoal: number;
};

/** Device-only switches, never exported. */
export type DeviceSettings = {
  restNotifications: boolean;
  keepAwake: boolean;
  haptics: boolean;
  healthSync: boolean;
};

export const defaultPreferences: Preferences = { weightUnit: 'kg', calorieGoal: 0, proteinGoal: 0 };
export const defaultDeviceSettings: DeviceSettings = { restNotifications: false, keepAwake: true, haptics: true, healthSync: false };

export type PlanDraftItem = Pick<PlanItem, 'exerciseId' | 'sets' | 'reps' | 'weight' | 'unit' | 'restSeconds'>;

export const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const isWarmup = (set: Pick<WorkoutSet, 'kind'>) => set.kind === 'warmup';

export const rpeOptions = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const isRpe = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 5 && value <= 10 && Number.isInteger(value * 2);

/** Completed working sets only; warm-ups and timed sets never add volume. */
export const volumeOf = (sets: WorkoutSet[]) =>
  sets.reduce((sum, set) => sum + (set.completed && set.unit !== 'seconds' && !isWarmup(set) ? set.weight * set.reps : 0), 0);

export const dateLabel = (iso: string, now = new Date()) => {
  const date = new Date(iso);
  const label = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === now.getFullYear() ? label : `${date.getFullYear()}年${label}`;
};

export const durationLabel = (start: string, end: string | null) => {
  const minutes = Math.max(1, Math.round((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 60000));
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
};

export const clockLabel = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const rest = `${String(Math.floor((seconds % 3600) / 60)).padStart(hours ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${rest}` : rest;
};
