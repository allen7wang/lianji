import type { WeightUnit } from './types';

export const KG_PER_LB = 0.45359237;
export const MAX_WEIGHT_KG = 2000;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

const trim = (value: number, digits: number) => String(Number(value.toFixed(digits)));

/** Number only, in the chosen unit: kg keeps one decimal, lb rounds to 0.5. */
export function formatWeightValue(kg: number, unit: WeightUnit) {
  if (!Number.isFinite(kg)) return '0';
  return unit === 'lb' ? trim(Math.round(kgToLb(kg) * 2) / 2, 1) : trim(kg, 1);
}

export const formatWeight = (kg: number, unit: WeightUnit) => `${formatWeightValue(kg, unit)} ${unit}`;

/** Parses text typed in the chosen unit and returns kilograms, or null when out of range. */
export function parseWeightInput(text: string, unit: WeightUnit): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (!text.trim() || !Number.isFinite(value) || value < 0) return null;
  const kg = unit === 'lb' ? lbToKg(value) : value;
  if (kg > MAX_WEIGHT_KG + 1e-9) return null;
  // Keep enough precision that lb values survive a round trip.
  return Math.round(Math.min(kg, MAX_WEIGHT_KG) * 10000) / 10000;
}

/** Converts a step in the display unit (e.g. +5 lb) to kilograms. */
export const stepToKg = (step: number, unit: WeightUnit) => unit === 'lb' ? lbToKg(step) : step;

/** Rounds a kilogram value to the nearest increment of the display unit. */
export function roundToIncrement(kg: number, increment: number, unit: WeightUnit) {
  const display = unit === 'lb' ? kgToLb(kg) : kg;
  const rounded = Math.round(display / increment) * increment;
  return unit === 'lb' ? lbToKg(rounded) : rounded;
}

const compact = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, notation: 'compact' });

/** Training volume (weight × reps) in the display unit, compact for large totals. */
export function formatVolume(kg: number, unit: WeightUnit) {
  const value = unit === 'lb' ? kgToLb(kg) : kg;
  return value >= 10000 ? compact.format(value) : Math.round(value).toLocaleString('zh-CN');
}
