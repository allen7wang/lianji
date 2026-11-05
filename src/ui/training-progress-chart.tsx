import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Workout } from '@/lib/types';
import { Card } from './components';
import { C } from './theme';

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });
export const formatProgressNumber = (value: number) => numberFormat.format(value);

export function TrainingProgressChart({ description, points, unit, onOpenWorkout }: {
  description: string;
  points: { workout: Workout; value: number }[];
  unit: string;
  onOpenWorkout: (id: string) => void;
}) {
  const max = Math.max(...points.map(point => point.value), 1);
  return <Card style={styles.trend}>
    <Text style={styles.description}>{description}</Text>
    <View style={styles.plot}>
      {points.map(({ workout, value }, index) => {
        const date = new Date(workout.startedAt);
        const recent = index === points.length - 1;
        const formatted = formatProgressNumber(value);
        return <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日，${workout.name}，${formatted} ${unit}`} accessibilityHint="查看这次训练" onPress={() => onOpenWorkout(workout.id)} style={({ pressed }) => [styles.point, pressed && styles.pressed]}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.pointValue}>{formatted}</Text>
          <View style={[styles.bar, { height: Math.max(4, value / max * 78) }, recent && styles.barRecent, value === 0 && styles.barZero]} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.pointDate}>{date.getMonth() + 1}/{date.getDate()}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={styles.description}>单位 {unit} · 点选柱形查看记录</Text>
  </Card>;
}

const styles = StyleSheet.create({
  trend: { gap: 10 },
  description: { color: C.muted, fontSize: 12, lineHeight: 18 },
  plot: { minHeight: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  point: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  pointValue: { color: C.text, fontSize: 11, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'], maxWidth: '100%' },
  pointDate: { color: C.muted, fontSize: 11, textAlign: 'center', fontVariant: ['tabular-nums'], maxWidth: '100%' },
  bar: { width: '62%', maxWidth: 46, borderRadius: 7, backgroundColor: '#628848' },
  barRecent: { backgroundColor: C.accent },
  barZero: { backgroundColor: C.line },
  pressed: { opacity: 0.7 },
});
