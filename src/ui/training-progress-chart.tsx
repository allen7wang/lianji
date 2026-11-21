import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { localDayKey } from '@/lib/training-progress';
import type { Workout } from '@/lib/types';
import { Card, Txt } from './components';
import { makeStyles, space, useTheme } from './theme';

const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 3 });
export const formatProgressNumber = (value: number) => numberFormat.format(value);
const tickFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1, notation: 'compact' });

/** One session on the chart. `value` is in the display unit (drives geometry); `label` is its formatted text. */
export type ChartPoint = { workout: Workout; value: number; label: string };

const PLOT_HEIGHT = 140;
const INSET = 10;
const GUTTER = 34;
const LINE = 2;

function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * power;
}

/** Clean gridline values. Bars always start at zero; lines zoom to the data so small gains stay visible. */
function niceScale(values: number[], fromZero: boolean) {
  let low = fromZero ? 0 : Math.min(...values);
  let high = Math.max(...values, 0);
  if (high <= low) {
    const pad = niceStep(Math.max(Math.abs(high) * 0.1, 1));
    high += pad;
    low = fromZero ? 0 : Math.max(0, low - pad);
  }
  const step = niceStep((high - low) / 2);
  const min = Math.max(0, Math.floor(low / step) * step);
  const max = Math.max(Math.ceil(high / step) * step, min + step);
  const ticks: number[] = [];
  for (let index = 0; min + index * step <= max + step / 2; index++) ticks.push(Math.round((min + index * step) * 1e6) / 1e6);
  return { min, max, ticks };
}

/**
 * Session trend in the 迹线 style: a 2 px data-colored line with 6 px points (latest in accent),
 * or data-colored columns with today's session in accent. Each column opens its workout.
 */
export function TrainingProgressChart({ description, points, unit, kind = 'line', onOpenWorkout }: {
  description: string;
  /** Oldest first. */
  points: ChartPoint[];
  unit: string;
  kind?: 'line' | 'bar';
  onOpenWorkout: (id: string) => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  if (!points.length) return null;
  const todayKey = localDayKey(new Date());
  const latest = points[points.length - 1];
  const { min, max, ticks } = niceScale(points.map(point => point.value), kind === 'bar');
  const slot = width / points.length;
  const y = (value: number) => INSET + (1 - (value - min) / (max - min)) * (PLOT_HEIGHT - INSET * 2);
  const xs = points.map((_, index) => (index + 0.5) * slot);
  const isToday = (point: ChartPoint) => localDayKey(new Date(point.workout.startedAt)) === todayKey;
  const barWidth = Math.min(24, slot * 0.5);
  const baseline = y(min);

  return <Card style={s.card}>
    <View style={s.top}>
      <Txt variant="caption" tone="muted" style={{ flex: 1 }}>{description}</Txt>
      <View style={s.readout}>
        <Txt variant="number">{latest.label}<Txt variant="caption" tone="muted">{` ${unit}`}</Txt></Txt>
        <Txt variant="caption" tone="muted">{isToday(latest) ? '今天' : '最近一次'}</Txt>
      </View>
    </View>
    <View style={s.chart}>
      <View style={s.gutter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {ticks.map(tick => <Txt key={tick} variant="caption" tone="faint" style={[s.tick, { top: y(tick) - 7 }]} numberOfLines={1}>{tickFormat.format(tick)}</Txt>)}
      </View>
      <View style={s.plot} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        {ticks.map(tick => <View key={tick} style={[s.grid, { top: y(tick) }]} />)}
        {width > 0 && kind === 'bar' ? points.map((point, index) => {
          const top = point.value > 0 ? Math.min(y(point.value), baseline - 4) : baseline - 4;
          const color = point.value <= 0 ? c.surfaceAlt : isToday(point) ? c.accent : c.data;
          return <View key={point.workout.id} style={[s.bar, { left: xs[index] - barWidth / 2, width: barWidth, top, height: baseline - top, backgroundColor: color }]} />;
        }) : null}
        {width > 0 && kind === 'line' ? <>
          {points.slice(1).map((point, index) => {
            const x1 = xs[index];
            const y1 = y(points[index].value);
            const x2 = xs[index + 1];
            const y2 = y(point.value);
            const length = Math.hypot(x2 - x1, y2 - y1);
            const angle = Math.atan2(y2 - y1, x2 - x1);
            return <View key={point.workout.id} style={[s.segment, { left: (x1 + x2) / 2 - length / 2, top: (y1 + y2) / 2 - LINE / 2, width: length, transform: [{ rotate: `${angle}rad` }] }]} />;
          })}
          {points.map((point, index) => {
            const last = index === points.length - 1;
            const size = last ? 12 : 10;
            return <View key={point.workout.id} style={[s.dot, last && s.dotLatest, { width: size, height: size, borderRadius: size / 2, left: xs[index] - size / 2, top: y(point.value) - size / 2 }]} />;
          })}
        </> : null}
        <View style={s.columns}>
          {points.map(point => {
            const date = new Date(point.workout.startedAt);
            return <Pressable key={point.workout.id} accessibilityRole="button" accessibilityLabel={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日，${point.workout.name}，${point.label} ${unit}`} accessibilityHint="查看这次训练"
              onPress={() => onOpenWorkout(point.workout.id)} style={({ pressed }) => [s.column, pressed && s.columnPressed]} />;
          })}
        </View>
      </View>
    </View>
    <View style={s.dates} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {points.map((point, index) => {
        const date = new Date(point.workout.startedAt);
        const last = index === points.length - 1;
        return <Txt key={point.workout.id} variant="caption" tone={last ? 'default' : 'muted'} numberOfLines={1} style={[s.date, last && s.dateLatest]}>
          {kind === 'bar' && isToday(point) ? '今天' : `${date.getMonth() + 1}/${date.getDate()}`}
        </Txt>;
      })}
    </View>
    <Txt variant="caption" tone="faint">单位 {unit} · 点选{kind === 'bar' ? '柱形' : '数据点'}查看记录</Txt>
  </Card>;
}

const useStyles = makeStyles(c => ({
  card: { gap: space.md, paddingHorizontal: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  readout: { alignItems: 'flex-end' },
  chart: { flexDirection: 'row' },
  gutter: { width: GUTTER, height: PLOT_HEIGHT },
  tick: { position: 'absolute', left: 0, right: 6, fontSize: 11, lineHeight: 14, textAlign: 'right', fontVariant: ['tabular-nums'] },
  plot: { flex: 1, height: PLOT_HEIGHT },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: c.border },
  bar: { position: 'absolute', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  segment: { position: 'absolute', height: LINE, borderRadius: LINE / 2, backgroundColor: c.data },
  dot: { position: 'absolute', backgroundColor: c.data, borderWidth: 2, borderColor: c.surface },
  dotLatest: { backgroundColor: c.accent },
  columns: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  column: { flex: 1, minHeight: 44 },
  columnPressed: { backgroundColor: c.surfaceAlt, opacity: 0.5, borderRadius: 8 },
  dates: { flexDirection: 'row', marginLeft: GUTTER, marginTop: -space.xs },
  date: { flex: 1, minWidth: 0, fontSize: 11, textAlign: 'center', fontVariant: ['tabular-nums'] },
  dateLatest: { fontWeight: '800' },
}));
