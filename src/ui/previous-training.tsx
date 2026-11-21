import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { targetLabel, type TrainingUnit, type WeightUnit, type Workout, type WorkoutSet } from '@/lib/types';
import { formatWeight } from '@/lib/units';
import { Txt } from './components';
import { makeStyles, radius, space, useTheme } from './theme';

export type PreviousTrainingEntry = { unit: TrainingUnit; workout: Workout; sets: WorkoutSet[] };

const unitLabels: Record<TrainingUnit, string> = { reps: '按次', seconds: '按秒' };

function setLabel(set: WorkoutSet, unit: TrainingUnit, weightUnit: WeightUnit) {
  const target = targetLabel(set.reps, unit);
  if (!Number.isFinite(set.weight) || set.weight <= 0) return target;
  return unit === 'seconds' ? `${target} · ${formatWeight(set.weight, weightUnit)}` : `${formatWeight(set.weight, weightUnit)} × ${target}`;
}

function sessionDate(startedAt: string) {
  const date = new Date(startedAt);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export const PreviousTraining = memo(function PreviousTraining({ exerciseName, entries, weightUnit }: { exerciseName: string; entries: PreviousTrainingEntry[]; weightUnit: WeightUnit }) {
  const s = useStyles();
  const { c } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return null;
  const last = entries[0].sets.at(-1);
  const summary = entries.length === 1 && last
    ? `${entries[0].sets.length} 组 · 末组 ${setLabel(last, entries[0].unit, weightUnit)}`
    : entries.map(({ unit, sets }) => `${unitLabels[unit]} ${sets.length} 组`).join(' · ');

  return <View style={s.panel}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${exerciseName}的上次组次，${summary}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [s.toggle, pressed && { opacity: 0.7 }]}>
      <Ionicons name="time-outline" size={16} color={c.textMuted} />
      <Txt variant="caption" tone="muted" style={{ fontWeight: '700' }}>上次</Txt>
      <Txt variant="caption" style={{ flex: 1, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{summary}</Txt>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={c.textFaint} />
    </Pressable>
    {expanded ? <View style={s.details}>
      {entries.map(({ unit, workout, sets }) => <View key={unit} style={s.session}>
        <Txt variant="caption" tone="muted">{unitLabels[unit]} · {sessionDate(workout.startedAt)} · {workout.name}</Txt>
        {sets.map((set, index) => <View key={set.id} style={s.set}>
          <Txt variant="caption" tone="muted">第 {index + 1} 组</Txt>
          <Txt variant="caption" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>{setLabel(set, unit, weightUnit)}{set.rpe != null ? ` · RPE ${set.rpe}` : ''}</Txt>
        </View>)}
      </View>)}
    </View> : null}
  </View>;
});

const useStyles = makeStyles(c => ({
  panel: { borderRadius: radius.md, backgroundColor: c.surfaceAlt },
  toggle: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  details: { paddingHorizontal: space.md, paddingBottom: space.sm },
  session: { gap: 4, borderTopWidth: 1, borderTopColor: c.border, paddingVertical: space.sm },
  set: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
}));
