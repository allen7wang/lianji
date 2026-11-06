import type { BodyEntry, FoodEntry } from './types';
import { localDayKey } from './training-progress';

export type BodyFatPoint = {
  id: string;
  recordedAt: string;
  bodyFat: number;
};

export type BodyTrend = {
  latest: BodyEntry | null;
  previous: BodyEntry | null;
  weightDelta: number | null;
  points: BodyEntry[];
  fatPoints: BodyFatPoint[];
};

export type NutritionDay = {
  day: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function ascending(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finiteBodyFat(entry: BodyEntry): entry is BodyEntry & { bodyFat: number } {
  return typeof entry.bodyFat === 'number' && Number.isFinite(entry.bodyFat);
}

const roundTenth = (value: number) => Math.round(value * 10) / 10;

export function buildBodyTrend(entries: BodyEntry[], limit = 8): BodyTrend {
  const sorted = [...entries].sort((a, b) => ascending(a.recordedAt, b.recordedAt) || ascending(a.id, b.id));
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  return {
    latest,
    previous,
    weightDelta: latest && previous ? latest.weight - previous.weight : null,
    points: sorted.slice(-limit),
    fatPoints: sorted.filter(finiteBodyFat).slice(-limit).map(({ id, recordedAt, bodyFat }) => ({ id, recordedAt, bodyFat })),
  };
}

export function buildNutritionTrend(entries: FoodEntry[], limit = 7): NutritionDay[] {
  const byDay = new Map<string, NutritionDay>();
  for (const entry of entries) {
    const day = localDayKey(new Date(entry.loggedAt));
    const current = byDay.get(day) ?? { day, calories: 0, protein: 0, carbs: 0, fat: 0 };
    current.calories += entry.calories;
    current.protein += entry.protein;
    current.carbs += entry.carbs;
    current.fat += entry.fat;
    byDay.set(day, current);
  }
  return [...byDay.values()]
    .map(day => ({
      day: day.day,
      calories: roundTenth(day.calories),
      protein: roundTenth(day.protein),
      carbs: roundTenth(day.carbs),
      fat: roundTenth(day.fat),
    }))
    .sort((a, b) => ascending(a.day, b.day))
    .slice(-limit);
}
