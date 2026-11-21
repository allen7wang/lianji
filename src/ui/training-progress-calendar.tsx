import { Pressable, View } from 'react-native';
import { Card, IconButton, Txt } from './components';
import { makeStyles, radius, space, useTheme } from './theme';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

export type CalendarDay = {
  key: string;
  date: Date;
  count: number;
  inPeriod: boolean;
  today: boolean;
  future: boolean;
};

/**
 * Month (or single-week) grid: trained days are filled ink circles, today carries an accent ring,
 * and the selected day sits on a cobalt tile. Days with several sessions show a dot per session.
 */
export function TrainingCalendar({ label, days, selectedDay, canGoBack, canGoForward, onMove, onToday, onSelect }: {
  label: string;
  days: CalendarDay[];
  selectedDay: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  onMove: (direction: -1 | 1) => void;
  onToday: () => void;
  onSelect: (day: CalendarDay) => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return <Card style={s.calendar}>
    <View style={s.header}>
      <IconButton icon="chevron-back" label="上一个时段" disabled={!canGoBack} onPress={() => onMove(-1)} />
      <Txt variant="title3" style={s.title} accessibilityRole="header" accessibilityLiveRegion="polite">{label}</Txt>
      <IconButton icon="chevron-forward" label="下一个时段" disabled={!canGoForward} onPress={() => onMove(1)} />
    </View>
    <View style={s.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {weekdays.map(day => <Txt key={day} variant="caption" tone="faint" style={s.weekday}>{day}</Txt>)}
    </View>
    {Array.from({ length: days.length / 7 }, (_, index) => <View key={days[index * 7].key} style={s.week}>
      {days.slice(index * 7, index * 7 + 7).map(day => {
        if (!day.inPeriod) return <View key={day.key} style={s.cell} />;
        const selected = selectedDay === day.key;
        const trained = day.count > 0;
        return <Pressable key={day.key} accessibilityRole="button"
          accessibilityLabel={`${day.date.getFullYear()}年${day.date.getMonth() + 1}月${day.date.getDate()}日，${day.today ? '今天，' : ''}${trained ? `${day.count} 次训练` : '无训练'}`}
          accessibilityState={{ selected, disabled: day.future }} disabled={day.future} onPress={() => onSelect(day)}
          style={({ pressed }) => [s.cell, selected && s.cellSelected, pressed && s.pressed]}>
          <View style={[s.day, trained && s.dayTrained, day.today && s.dayToday]}>
            <Txt variant="bodyStrong" tone={trained ? 'inverse' : day.today ? 'accent' : day.future ? 'faint' : 'default'} style={s.dayLabel}>{day.date.getDate()}</Txt>
          </View>
          <View style={s.marks}>
            {day.count > 1 ? Array.from({ length: Math.min(day.count, 3) }, (_, mark) => <View key={mark} style={[s.mark, { backgroundColor: selected ? c.data : c.text }]} />) : null}
          </View>
        </Pressable>;
      })}
    </View>)}
    <View style={s.footer}>
      <View style={s.legend} accessible accessibilityLabel="图例：实心圆为有训练记录，橙色圆环为今天">
        <View style={s.legendItem}><View style={s.legendTrained} /><Txt variant="caption" tone="muted">有训练</Txt></View>
        <View style={s.legendItem}><View style={s.legendToday} /><Txt variant="caption" tone="muted">今天</Txt></View>
      </View>
      {canGoForward ? <Pressable accessibilityRole="button" hitSlop={8} onPress={onToday} style={({ pressed }) => [s.todayButton, pressed && s.pressed]}>
        <Txt variant="bodyStrong" tone="accent" style={{ fontSize: 14 }}>回到今天</Txt>
      </Pressable> : <Txt variant="caption" tone="faint">点选日期查看明细</Txt>}
    </View>
  </Card>;
}

const DAY = 36;

const useStyles = makeStyles(c => ({
  calendar: { paddingHorizontal: space.md, paddingVertical: space.lg, gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs, marginBottom: space.sm },
  title: { flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'] },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', paddingVertical: space.xs },
  cell: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1.5, borderColor: 'transparent', paddingTop: 3 },
  cellSelected: { backgroundColor: c.dataSoft, borderColor: c.data },
  pressed: { opacity: 0.7 },
  day: { width: DAY, height: DAY, borderRadius: DAY / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  dayTrained: { backgroundColor: c.inverse, borderColor: c.inverse },
  dayToday: { borderColor: c.accent },
  dayLabel: { fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] },
  marks: { height: 7, flexDirection: 'row', alignItems: 'center', gap: 3 },
  mark: { width: 4, height: 4, borderRadius: 2 },
  footer: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.xs, marginTop: space.xs },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendTrained: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.inverse },
  legendToday: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: c.accent },
  todayButton: { minHeight: 44, justifyContent: 'center' },
}));
