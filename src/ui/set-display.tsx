import { Text, View } from 'react-native';
import { estimateOneRepMax } from '@/lib/training-progress';
import { isWarmup, type WeightUnit, type WorkoutSet } from '@/lib/types';
import { kgToLb } from '@/lib/units';
import { Tag } from './components';
import { makeStyles, radius } from './theme';

/** Kilograms in the display unit, unrounded; use for chart geometry. */
export const toDisplayWeight = (kg: number, unit: WeightUnit) => unit === 'lb' ? kgToLb(kg) : kg;

/** Estimated 1RM rounded per docs/data-contract.md §4: 0.5 kg, or 1 lb. */
export function formatOneRepMaxValue(kg: number, unit: WeightUnit) {
  return String(unit === 'lb' ? Math.round(kgToLb(kg)) : Math.round(kg * 2) / 2);
}

export const formatOneRepMax = (kg: number, unit: WeightUnit) => `${formatOneRepMaxValue(kg, unit)} ${unit}`;

/** Best Epley estimate among completed, loaded, rep-based working sets. */
export function bestOneRepMax(sets: Pick<WorkoutSet, 'weight' | 'reps' | 'completed' | 'unit' | 'kind'>[]) {
  let best: number | undefined;
  for (const set of sets) {
    if (!set.completed || isWarmup(set) || set.unit === 'seconds') continue;
    const estimate = estimateOneRepMax(set.weight, set.reps);
    if (estimate !== undefined && estimate > (best ?? 0)) best = estimate;
  }
  return best;
}

/**
 * Visible numbers for one exercise's sets, in order: warm-ups are `null` (shown as "W"),
 * working sets count 1, 2, 3… so warm-ups never shift the working numbering.
 */
export function setOrdinals(sets: Pick<WorkoutSet, 'id' | 'kind'>[]) {
  const ordinals = new Map<string, { warmup: boolean; number: number }>();
  let working = 0;
  let warmups = 0;
  for (const set of sets) {
    if (isWarmup(set)) ordinals.set(set.id, { warmup: true, number: ++warmups });
    else ordinals.set(set.id, { warmup: false, number: ++working });
  }
  return ordinals;
}

/** Spoken / error-message name of a set, e.g. "第 2 组" or "热身第 1 组". */
export const setTitle = (ordinal: { warmup: boolean; number: number } | undefined) =>
  !ordinal ? '这一组' : ordinal.warmup ? `热身第 ${ordinal.number} 组` : `第 ${ordinal.number} 组`;

/** The 32-wide set number cell: working sets show their number, warm-ups a "W" in warning color. */
export function SetIndex({ warmup, number }: { warmup: boolean; number: number }) {
  const s = useStyles();
  return <View style={s.index} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Text style={[s.indexText, warmup && s.warmupText]}>{warmup ? 'W' : number}</Text>
  </View>;
}

export function RpeTag({ rpe }: { rpe: number | null | undefined }) {
  if (rpe === null || rpe === undefined) return null;
  return <Tag label={`RPE ${rpe}`} tone="neutral" />;
}

const useStyles = makeStyles(c => ({
  index: { width: 32, minHeight: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  indexText: { color: c.textMuted, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  warmupText: { color: c.warning },
}));
