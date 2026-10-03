export type Exercise = {
  id: string;
  name: string;
  muscle: string;
  equipment: string;
  isCustom: number;
};

export type TrainingUnit = 'reps' | 'seconds';
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

export type PlanDraftItem = Pick<PlanItem, 'exerciseId' | 'sets' | 'reps' | 'weight' | 'unit' | 'restSeconds'>;

export const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const volumeOf = (sets: WorkoutSet[]) =>
  sets.reduce((sum, set) => sum + (set.completed && set.unit !== 'seconds' ? set.weight * set.reps : 0), 0);

export const dateLabel = (iso: string) => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

export const durationLabel = (start: string, end: string | null) => {
  const minutes = Math.max(1, Math.round((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 60000));
  return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
};
