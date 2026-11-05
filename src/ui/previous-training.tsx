import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { targetLabel, type TrainingUnit, type Workout, type WorkoutSet } from '@/lib/types';
import { C } from './theme';

export type PreviousTrainingEntry = { unit: TrainingUnit; workout: Workout; sets: WorkoutSet[] };

const unitLabels: Record<TrainingUnit, string> = { reps: '按次', seconds: '按秒' };

function setLabel(set: WorkoutSet, unit: TrainingUnit) {
  const target = targetLabel(set.reps, unit);
  if (!Number.isFinite(set.weight) || set.weight <= 0) return target;
  return unit === 'seconds' ? `${target} · ${set.weight} kg` : `${set.weight} kg × ${target}`;
}

function sessionDate(startedAt: string) {
  const date = new Date(startedAt);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export const PreviousTraining = memo(function PreviousTraining({ exerciseName, entries }: { exerciseName: string; entries: PreviousTrainingEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return null;
  const last = entries[0].sets.at(-1);
  const summary = entries.length === 1 && last
    ? `${entries[0].sets.length} 组 · 末组 ${setLabel(last, entries[0].unit)}`
    : entries.map(({ unit, sets }) => `${unitLabels[unit]} ${sets.length} 组`).join(' · ');

  return <View style={styles.panel}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${exerciseName}的上次组次，${summary}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <Ionicons name="time-outline" size={18} color={C.accent} />
      <View style={styles.summary}>
        <Text style={styles.title}>上次组次</Text>
        <Text style={styles.detail}>{summary}</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={C.muted} />
    </Pressable>
    {expanded ? <View style={styles.details}>
      {entries.map(({ unit, workout, sets }) => <View key={unit} style={styles.session}>
        <Text style={styles.sessionLabel}>{unitLabels[unit]} · {sessionDate(workout.startedAt)}</Text>
        <Text style={styles.sessionName}>{workout.name}</Text>
        {sets.map(set => <View key={set.id} style={styles.set}>
          <Text style={styles.setNumber}>第 {set.setNumber} 组</Text>
          <Text style={styles.setValue}>{setLabel(set, unit)}</Text>
        </View>)}
      </View>)}
    </View> : null}
  </View>;
});

const styles = StyleSheet.create({
  panel: { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.line, borderRadius: 13 },
  toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, paddingHorizontal: 11 },
  pressed: { opacity: 0.7 },
  summary: { flex: 1, gap: 3 },
  title: { color: C.text, fontSize: 13, fontWeight: '800' },
  detail: { color: C.muted, fontSize: 12, lineHeight: 16 },
  details: { paddingHorizontal: 11, paddingBottom: 8 },
  session: { gap: 6, borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 9 },
  sessionLabel: { color: C.accent, fontSize: 12, fontWeight: '700' },
  sessionName: { color: C.text, fontSize: 13, fontWeight: '700' },
  set: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingVertical: 3 },
  setNumber: { color: C.muted, fontSize: 12, flexShrink: 1 },
  setValue: { color: C.text, fontSize: 13, fontWeight: '700', textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] },
});
