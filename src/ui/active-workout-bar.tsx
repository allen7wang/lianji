import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useActiveWorkout } from '@/lib/data';
import { clockLabel } from '@/lib/types';
import { useNow } from '@/lib/use-now';
import { useWorkoutTimer } from '@/lib/workout-timer';
import { radius, space, type, useTheme } from './theme';

/** Floating pill above the tab bar while a workout is in progress. */
export function ActiveWorkoutBar({ bottom }: { bottom: number }) {
  const { workout, sets } = useActiveWorkout();
  const { timer } = useWorkoutTimer();
  const now = useNow(!!workout);
  const { c } = useTheme();
  if (!workout) return null;
  const elapsed = (now - Date.parse(workout.startedAt)) / 1000;
  const done = sets.filter(set => set.completed).length;
  const remaining = timer ? Math.ceil((timer.deadline - now) / 1000) : 0;
  const timerLabel = timer ? remaining > 0 ? `${timer.kind === 'rest' ? '休息' : '计时'} ${clockLabel(remaining)}` : timer.kind === 'rest' ? '休息结束' : '计时结束' : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`继续训练：${workout.name}，已进行 ${Math.floor(elapsed / 60)} 分钟，完成 ${done} 组${timerLabel ? `，${timerLabel}` : ''}`}
    onPress={() => router.push('/workout')} style={({ pressed }) => [styles.bar, { bottom, backgroundColor: c.accent }, pressed && { opacity: 0.85 }]}>
    <View style={[styles.dot, { backgroundColor: c.onAccent }]} />
    <View style={{ flex: 1 }}>
      <Text numberOfLines={1} style={[type.bodyStrong, { color: c.onAccent }]}>{workout.name}</Text>
      <Text numberOfLines={1} style={[type.caption, styles.meta, { color: c.onAccent }]}>{clockLabel(elapsed)} · {done}/{sets.length} 组</Text>
    </View>
    {timerLabel ? <View style={[styles.timer, { backgroundColor: c.onAccent }]}>
      <Ionicons name="timer-outline" size={14} color={c.accent} />
      <Text style={[type.caption, styles.timerText, { color: c.accent }]}>{timerLabel}</Text>
    </View> : null}
    <Ionicons name="chevron-up" size={20} color={c.onAccent} />
  </Pressable>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: space.md, right: space.md, minHeight: 56, borderRadius: radius.pill, paddingLeft: space.lg, paddingRight: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { opacity: 0.75, fontVariant: ['tabular-nums'] },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, minHeight: 28 },
  timerText: { fontWeight: '800', fontVariant: ['tabular-nums'] },
});
