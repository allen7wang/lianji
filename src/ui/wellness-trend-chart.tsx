import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { Card, Txt } from './components';
import { makeStyles, radius, space, useTheme } from './theme';

export type WellnessTrendPoint = { id: string; date: string; value: number };

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const formatValue = (value: number) => numberFormat.format(value);

function trendDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12);
  return new Date(value);
}

const PLOT_HEIGHT = 112;
const DOT = 12;

/**
 * Single-series trend. `line` (trace line + dots) for body measurements, `bar` (columns from zero) for daily totals.
 * Tap a column to read its value; the newest point is drawn in the accent color.
 */
export function WellnessTrendChart({ description, points, unit, kind = 'bar', goal }: {
  description: string;
  points: WellnessTrendPoint[];
  unit: string;
  kind?: 'bar' | 'line';
  /** Optional horizontal goal line for bar charts; 0 or undefined hides it. */
  goal?: number;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!points.length) return null;

  const lastIndex = points.length - 1;
  const found = points.findIndex(point => point.id === selectedId);
  const selectedIndex = found >= 0 ? found : lastIndex;
  const selected = points[selectedIndex];
  const values = points.map(point => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const slot = width / points.length;

  // Bars grow from zero; lines zoom to the data range so small body changes stay visible.
  const showGoal = kind === 'bar' && !!goal && goal > 0;
  const barMax = Math.max(max, showGoal ? goal : 0, 1);
  const pad = Math.max((max - min) * 0.2, Math.abs(max) * 0.01, 0.5);
  const lo = min - pad;
  const hi = max + pad;
  const y = (value: number) => kind === 'bar' ? PLOT_HEIGHT - value / barMax * PLOT_HEIGHT : PLOT_HEIGHT - (value - lo) / (hi - lo) * PLOT_HEIGHT;
  const x = (index: number) => slot * (index + 0.5);
  const selectedDate = trendDate(selected.date);

  return <Card style={s.card}>
    <View style={s.head}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title3">{description}</Txt>
        <Txt variant="caption" tone="muted">单位 {unit}{kind === 'line' && points.length > 1 ? ` · 最低 ${formatValue(min)} · 最高 ${formatValue(max)}` : ''}</Txt>
      </View>
      <View style={s.readout} accessibilityLiveRegion="polite">
        <Txt variant="number">{formatValue(selected.value)}<Txt variant="caption" tone="muted">{` ${unit}`}</Txt></Txt>
        <Txt variant="caption" tone="muted">{selected === points[lastIndex] ? '最新 · ' : ''}{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日</Txt>
      </View>
    </View>

    <View style={s.plot} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <View style={[s.grid, { top: 0 }]} />
      <View style={[s.grid, { top: PLOT_HEIGHT / 2 }]} />
      <View style={[s.grid, { top: PLOT_HEIGHT }]} />
      {showGoal ? <View style={[s.goal, { top: y(goal) }]}>
        <Txt variant="caption" tone="muted" style={s.goalLabel}>目标 {formatValue(goal)}</Txt>
      </View> : null}

      {width > 0 && kind === 'line' ? <>
        {points.length > 1 ? <View style={[s.crosshair, { left: x(selectedIndex) - 0.5 }]} /> : null}
        {points.slice(1).map((point, index) => {
          const x1 = x(index), y1 = y(points[index].value), x2 = x(index + 1), y2 = y(point.value);
          const length = Math.hypot(x2 - x1, y2 - y1);
          const angle = Math.atan2(y2 - y1, x2 - x1);
          return <View key={point.id} style={[s.segment, { width: length, left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - 1, transform: [{ rotate: `${angle}rad` }] }]} />;
        })}
        {points.map((point, index) => <View key={point.id} style={[s.dot, { left: x(index) - DOT / 2, top: y(point.value) - DOT / 2, backgroundColor: index === lastIndex ? c.accent : c.data }]} />)}
      </> : null}

      {width > 0 && kind === 'bar' ? points.map((point, index) => {
        const height = point.value > 0 ? Math.max(4, PLOT_HEIGHT - y(point.value)) : 4;
        const barWidth = Math.min(24, slot * 0.6);
        return <View key={point.id} style={[s.bar, { left: x(index) - barWidth / 2, width: barWidth, height, backgroundColor: point.value <= 0 ? c.surfaceAlt : index === lastIndex ? c.accent : c.data }]} />;
      }) : null}

      <View style={s.hitRow}>
        {points.map((point, index) => {
          const parsed = trendDate(point.date);
          return <Pressable key={point.id} accessibilityRole="button" accessibilityState={{ selected: index === selectedIndex }}
            accessibilityLabel={`${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日，${formatValue(point.value)} ${unit}`}
            onPress={() => setSelectedId(point.id)} style={s.hit} />;
        })}
      </View>
    </View>

    <View style={s.axis}>
      {points.map((point, index) => {
        const parsed = trendDate(point.date);
        const active = point === selected;
        return <Txt key={point.id} variant="caption" tone={active ? 'default' : 'faint'} numberOfLines={1} style={[s.axisLabel, active && s.axisActive]}>{parsed.getMonth() + 1}/{parsed.getDate()}</Txt>;
      })}
    </View>
  </Card>;
}

const useStyles = makeStyles(c => ({
  card: { gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  readout: { alignItems: 'flex-end', gap: 2 },
  plot: { height: PLOT_HEIGHT, marginTop: space.sm },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: c.border },
  goal: { pointerEvents: 'none', position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: c.textFaint },
  goalLabel: { position: 'absolute', right: 0, bottom: 3, fontSize: 11, lineHeight: 14, backgroundColor: c.surface, paddingLeft: space.xs },
  crosshair: { pointerEvents: 'none', position: 'absolute', top: 0, height: PLOT_HEIGHT, width: 1, backgroundColor: c.border },
  segment: { pointerEvents: 'none', position: 'absolute', height: 2, borderRadius: 1, backgroundColor: c.data },
  dot: { pointerEvents: 'none', position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: c.surface },
  bar: { pointerEvents: 'none', position: 'absolute', bottom: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  hitRow: { position: 'absolute', top: -space.sm, bottom: -space.sm, left: 0, right: 0, flexDirection: 'row' },
  hit: { flex: 1, minHeight: 44, borderRadius: radius.sm },
  axis: { flexDirection: 'row', marginTop: -space.sm },
  axisLabel: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 11, fontVariant: ['tabular-nums'] },
  axisActive: { fontWeight: '800' },
}));
