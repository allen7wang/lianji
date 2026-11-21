import type { FoodEntry } from './types';

export const meals = ['早餐', '午餐', '晚餐', '加餐'] as const;
export type FoodTemplate = Pick<FoodEntry, 'name' | 'portion' | 'calories' | 'protein' | 'carbs' | 'fat'> & { meal: string; count: number; lastLoggedAt: string };
export type NutritionTotals = Pick<FoodEntry, 'calories' | 'protein' | 'carbs' | 'fat'>;

const foodKey = (entry: Pick<FoodEntry, 'name' | 'portion'>) => `${entry.name.trim()}\u0000${entry.portion.trim()}`;

/** Distinct foods (name + portion) using the latest nutrition values, newest first. */
export function recentFoods(entries: FoodEntry[], limit = 8): FoodTemplate[] {
  const byKey = new Map<string, FoodTemplate>();
  for (const entry of [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt) || a.id.localeCompare(b.id))) {
    const key = foodKey(entry);
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { name: entry.name, portion: entry.portion, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, meal: entry.meal, count: 1, lastLoggedAt: entry.loggedAt });
  }
  return [...byKey.values()].slice(0, limit);
}

/** The foods logged most often, ties broken by recency. */
export function frequentFoods(entries: FoodEntry[], limit = 8): FoodTemplate[] {
  return recentFoods(entries, Number.POSITIVE_INFINITY)
    .sort((a, b) => b.count - a.count || b.lastLoggedAt.localeCompare(a.lastLoggedAt))
    .slice(0, limit);
}

export function sameLocalDay(iso: string, day: Date) {
  return new Date(iso).toDateString() === day.toDateString();
}

export function dayTotals(entries: FoodEntry[], day: Date): NutritionTotals {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const entry of entries) {
    if (!sameLocalDay(entry.loggedAt, day)) continue;
    totals.calories += entry.calories;
    totals.protein += entry.protein;
    totals.carbs += entry.carbs;
    totals.fat += entry.fat;
  }
  const round = (value: number) => Math.round(value * 10) / 10;
  return { calories: round(totals.calories), protein: round(totals.protein), carbs: round(totals.carbs), fat: round(totals.fat) };
}

/** 0–1 progress toward a goal; null when the goal is not set. */
export const goalProgress = (value: number, goal: number) => goal > 0 ? Math.min(1, Math.max(0, value / goal)) : null;

/** Suggests the meal for "now" so quick-add lands in a sensible slot. */
export function mealForTime(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return '早餐';
  if (hour < 15) return '午餐';
  if (hour < 21) return '晚餐';
  return '加餐';
}
