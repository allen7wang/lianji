import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './components';
import { C } from './theme';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

export type CalendarDay = {
  key: string;
  date: Date;
  count: number;
  inPeriod: boolean;
  today: boolean;
  future: boolean;
};

export function ProgressTabs<T extends string>({ options, value, onChange }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return <View style={styles.tabs}>
    {options.map(option => {
      const selected = option.value === value;
      return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}>
        <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

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
  return <Card style={styles.calendar}>
    <View style={styles.calendarHeader}>
      <CalendarArrow direction={-1} enabled={canGoBack} onPress={onMove} />
      <Text style={styles.calendarTitle} accessibilityRole="header" accessibilityLiveRegion="polite">{label}</Text>
      <CalendarArrow direction={1} enabled={canGoForward} onPress={onMove} />
    </View>
    <View style={styles.week} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {weekdays.map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
    </View>
    {Array.from({ length: days.length / 7 }, (_, index) => <View key={days[index * 7].key} style={styles.week}>
      {days.slice(index * 7, index * 7 + 7).map(day => {
        const selected = selectedDay === day.key;
        const trained = day.count > 0;
        if (!day.inPeriod) return <View key={day.key} style={styles.dayCell} />;
        return <Pressable key={day.key} accessibilityRole="button" accessibilityLabel={`${day.date.getFullYear()}年${day.date.getMonth() + 1}月${day.date.getDate()}日，${day.today ? '今天，' : ''}${trained ? `${day.count} 次训练` : '无训练'}`} accessibilityState={{ selected, disabled: day.future }} disabled={day.future} onPress={() => onSelect(day)} style={({ pressed }) => [styles.dayCell, pressed && styles.pressed]}>
          <View style={[styles.day, trained && styles.dayTrained, day.today && styles.dayToday, selected && styles.daySelected]}>
            <Text style={[styles.dayLabel, trained && styles.dayLabelTrained, day.future && styles.dayLabelFuture, selected && styles.dayLabelSelected]}>{day.date.getDate()}</Text>
            {trained ? <View style={[styles.dayDot, selected && styles.dayDotSelected]} /> : null}
          </View>
        </Pressable>;
      })}
    </View>)}
    <View style={styles.calendarFooter}>
      <View style={styles.legend}><View style={styles.legendDot} /><Text style={styles.help}>有训练记录</Text></View>
      {canGoForward ? <Pressable accessibilityRole="button" onPress={onToday} style={styles.todayButton}><Text style={styles.todayLabel}>回到今天</Text></Pressable> : <Text style={styles.help}>点选日期查看明细</Text>}
    </View>
  </Card>;
}

function CalendarArrow({ direction, enabled, onPress }: { direction: -1 | 1; enabled: boolean; onPress: (direction: -1 | 1) => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={direction === -1 ? '上一个时段' : '下一个时段'} accessibilityState={{ disabled: !enabled }} disabled={!enabled} onPress={() => onPress(direction)} style={({ pressed }) => [styles.arrow, !enabled && styles.disabled, pressed && styles.pressed]}>
    <Ionicons name={direction === -1 ? 'chevron-back' : 'chevron-forward'} size={20} color={C.text} />
  </Pressable>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  tab: { flex: 1, minHeight: 44, paddingVertical: 8, paddingHorizontal: 3, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  tabSelected: { backgroundColor: C.accent },
  tabLabel: { color: C.muted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  tabLabelSelected: { color: C.bg },
  calendar: { paddingHorizontal: 8, paddingVertical: 12, gap: 2 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 6, marginBottom: 6, gap: 8 },
  calendarTitle: { color: C.text, fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  arrow: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated, borderRadius: 12, width: 44, height: 44 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, color: C.muted, fontSize: 12, textAlign: 'center', paddingVertical: 5 },
  dayCell: { flex: 1, minHeight: 44, padding: 2 },
  day: { flex: 1, minHeight: 38, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  dayTrained: { backgroundColor: C.accentDark },
  dayToday: { borderColor: C.accent },
  daySelected: { backgroundColor: C.accent, borderColor: C.accent },
  dayLabel: { color: C.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dayLabelTrained: { color: C.accent },
  dayLabelFuture: { color: C.faint },
  dayLabelSelected: { color: C.bg },
  dayDot: { position: 'absolute', bottom: 4, width: 3, height: 3, borderRadius: 2, backgroundColor: C.accent },
  dayDotSelected: { backgroundColor: C.bg },
  calendarFooter: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, paddingHorizontal: 8 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  help: { color: C.muted, fontSize: 12 },
  todayButton: { minHeight: 44, justifyContent: 'center' },
  todayLabel: { color: C.accent, fontSize: 12, fontWeight: '700' },
});
