import { StyleSheet, Text, View } from 'react-native';
import { Card } from './components';
import { C } from './theme';
import { formatProgressNumber } from './training-progress-chart';

export type WellnessTrendPoint = { id: string; date: string; value: number };

function trendDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12);
  return new Date(value);
}

export function WellnessTrendChart({ description, points, unit }: {
  description: string;
  points: WellnessTrendPoint[];
  unit: string;
}) {
  if (!points.length) return null;
  const max = Math.max(...points.map(point => point.value), 1);
  return <Card style={styles.trend}>
    <Text style={styles.title}>{description}</Text>
    <View style={styles.plot}>
      {points.map(({ id, date, value }, index) => {
        const parsed = trendDate(date);
        const recent = index === points.length - 1;
        const formatted = formatProgressNumber(value);
        return <View key={id} accessible accessibilityLabel={`${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日，${formatted} ${unit}`} style={styles.point}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.pointValue}>{formatted}</Text>
          <View style={[styles.bar, { height: Math.max(4, value / max * 78) }, recent && styles.barRecent, value === 0 && styles.barZero]} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.pointDate}>{parsed.getMonth() + 1}/{parsed.getDate()}</Text>
        </View>;
      })}
    </View>
    <Text style={styles.unit}>单位 {unit}</Text>
  </Card>;
}

const styles = StyleSheet.create({
  trend: { gap: 10 },
  title: { color: C.text, fontSize: 16, fontWeight: '700' },
  unit: { color: C.muted, fontSize: 12, lineHeight: 18 },
  plot: { minHeight: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  point: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  pointValue: { color: C.text, fontSize: 11, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'], maxWidth: '100%' },
  pointDate: { color: C.muted, fontSize: 11, textAlign: 'center', fontVariant: ['tabular-nums'], maxWidth: '100%' },
  bar: { width: '62%', maxWidth: 46, borderRadius: 7, backgroundColor: '#628848' },
  barRecent: { backgroundColor: C.accent },
  barZero: { backgroundColor: C.line },
});
