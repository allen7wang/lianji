import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { localDayKey, mondayOf } from '@/lib/training-progress';
import { completedScheduleKeys, parseScheduleDay, scheduleKey, scheduleStatus, type ScheduledTraining } from '@/lib/training-schedule';
import type { Plan } from '@/lib/types';
import { useTrainingDate } from '@/lib/use-training-date';
import { Button, Card, Empty, Field, IconButton, Page } from '@/ui/components';
import { C, space } from '@/ui/theme';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

function shiftDay(date: Date, offset: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + offset);
  return result;
}

function dateTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekTitle(start: Date) {
  const end = shiftDay(start, 6);
  return `${dateTitle(start)} – ${start.getFullYear() === end.getFullYear() ? `${end.getMonth() + 1}月${end.getDate()}日` : dateTitle(end)}`;
}

export default function TrainingSchedule() {
  const { day, planId } = useLocalSearchParams<{ day?: string | string[]; planId?: string | string[] }>();
  const requestedDay = Array.isArray(day) ? day[0] : day;
  const preferredPlanId = Array.isArray(planId) ? planId[0] : planId;
  return <ScheduleContent key={JSON.stringify([requestedDay, preferredPlanId])} initialDate={parseScheduleDay(requestedDay)} preferredPlanId={preferredPlanId} />;
}

function ScheduleContent({ initialDate, preferredPlanId }: { initialDate: Date | null; preferredPlanId?: string }) {
  const { ready, plans, workouts, workoutSets, schedule, schedulePlan, unschedulePlan } = useData();
  const today = useTrainingDate();
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const date = selectedDate ?? today;
  const todayKey = localDayKey(today);
  const dayKey = localDayKey(date);
  const canAssign = dayKey >= todayKey;
  const start = mondayOf(date);
  const entriesByDay = useMemo(() => {
    const grouped = new Map<string, ScheduledTraining[]>();
    for (const entry of schedule) {
      const entries = grouped.get(entry.day);
      if (entries) entries.push(entry);
      else grouped.set(entry.day, [entry]);
    }
    return grouped;
  }, [schedule]);
  const completed = useMemo(() => completedScheduleKeys(workouts, workoutSets), [workouts, workoutSets]);
  const dayEntries = entriesByDay.get(dayKey) ?? [];
  const planById = useMemo(() => new Map(plans.map(plan => [plan.id, plan])), [plans]);
  const assigned = new Set(dayEntries.map(entry => entry.planId));
  const available = plans.filter(plan => !assigned.has(plan.id));
  const preferred = available.find(plan => plan.id === preferredPlanId);

  function selectDate(next: Date | null) {
    if (pending.current) return;
    setSelectedDate(next);
    setError('');
  }

  function closePicker() {
    if (pending.current) return;
    setShowPicker(false);
    setError('');
  }

  async function updateSchedule(operation: () => Promise<void>, fallback: string) {
    if (pending.current) return false;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      await operation();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
      return false;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function add(plan: Plan) {
    if (dayKey < localDayKey(new Date())) {
      setError('请选择今天或之后的日期。');
      return;
    }
    if (await updateSchedule(() => schedulePlan(dayKey, plan.id), '无法添加安排，请重试。')) setShowPicker(false);
  }

  function confirmRemoval(entry: ScheduledTraining, name: string) {
    Alert.alert('移除训练安排？', `移除${dateTitle(date)}的「${name}」安排。`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => { void updateSchedule(() => unschedulePlan(entry.day, entry.planId), '无法移除安排，请重试。'); } },
    ]);
  }

  return <Page>
    <View style={styles.content}>
      <View style={styles.toolbar}>
        <IconButton icon="chevron-back" label="返回" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
        <Text accessibilityRole="header" style={styles.title}>训练安排</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => selectDate(null)} style={styles.todayButton}>
          <Text style={styles.todayText}>回到今天</Text>
        </Pressable>
      </View>
      <Card style={styles.calendar}>
        <View style={styles.weekHeading}>
          <Pressable accessibilityRole="button" accessibilityLabel="上一周" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => selectDate(shiftDay(date, -7))} style={styles.weekArrow}><Ionicons name="chevron-back" color={C.text} size={20} /></Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.weekLabel}>{weekTitle(start)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="下一周" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => selectDate(shiftDay(date, 7))} style={styles.weekArrow}><Ionicons name="chevron-forward" color={C.text} size={20} /></Pressable>
        </View>
        <View style={styles.days}>
          {weekdays.map((weekday, index) => {
            const day = shiftDay(start, index);
            const key = localDayKey(day);
            const count = entriesByDay.get(key)?.length ?? 0;
            const isToday = key === todayKey;
            const selected = key === dayKey;
            return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${dateTitle(day)}，周${weekday}，${isToday ? '今天，' : ''}${count ? `${count} 项安排` : '无安排'}`} accessibilityState={{ selected, disabled: saving }} disabled={saving} onPress={() => selectDate(day)} style={({ pressed }) => [styles.day, isToday && styles.dayToday, selected && styles.daySelected, pressed && styles.pressed]}>
              <Text style={[styles.dayLabel, selected && styles.dayTextSelected]}>周{weekday}</Text>
              <Text style={[styles.dayNumber, selected && styles.dayTextSelected]}>{day.getDate()}</Text>
              <View style={[styles.dot, count > 0 && styles.dotVisible, count > 0 && selected && styles.dotSelected]} />
            </Pressable>;
          })}
        </View>
        <View style={styles.legend}><View style={[styles.dot, styles.dotVisible]} /><Text style={styles.muted}>有训练安排</Text></View>
      </Card>
      {!ready ? <View style={styles.loading}><ActivityIndicator color={C.accent} /><Text style={styles.muted}>正在加载训练安排</Text></View> : <>
        <View style={styles.dateHeading}>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.dateTitle}>{dateTitle(date)}{dayKey === todayKey ? ' · 今天' : ''}</Text>
          <Text style={styles.muted}>{dayEntries.length} 项安排</Text>
        </View>
        {dayEntries.length === 0 ? <Card><Text style={styles.muted}>这一天没有安排训练。</Text></Card> : dayEntries.map(entry => {
          const status = scheduleStatus(entry, todayKey, completed);
          const name = planById.get(entry.planId)?.name ?? '未知计划';
          return <Card key={scheduleKey(entry)} style={styles.entry}>
            <View style={styles.entryIcon}><Ionicons name={status === '已完成' ? 'checkmark-circle-outline' : 'calendar-outline'} color={C.accent} size={22} /></View>
            <View style={styles.entryContent}>
              <Text style={styles.planName}>{name}</Text>
              <Text style={[styles.status, status === '已完成' && styles.done, status === '待训练' && styles.due]}>{status}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`移除${name}的安排`} accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => confirmRemoval(entry, name)} style={({ pressed }) => [styles.remove, pressed && styles.pressed]}><Ionicons name="trash-outline" color={C.danger} size={20} /></Pressable>
          </Card>;
        })}
        {!showPicker && error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null}
        {!canAssign ? <Text style={styles.muted}>可以为今天或之后的日期添加安排。</Text> : null}
        {canAssign && !plans.length ? <Button label="前往训练计划" icon="arrow-forward" variant="secondary" onPress={() => router.navigate('/plans')} /> : null}
        {canAssign && preferred ? <Button label={saving ? '正在处理…' : `安排「${preferred.name}」`} icon="add" disabled={saving} onPress={() => { void add(preferred); }} /> : null}
        {canAssign && available.length > (preferred ? 1 : 0) ? <Button label={preferred ? '选择其他计划' : '安排训练计划'} icon="calendar-outline" variant={preferred ? 'secondary' : 'primary'} disabled={saving} onPress={() => { setError(''); setShowPicker(true); }} /> : null}
        {canAssign && plans.length > 0 && !available.length ? <Text style={styles.muted}>所有计划都已安排在这一天。</Text> : null}
      </>}
      {showPicker ? <SchedulePlanPicker date={date} plans={preferred ? available.filter(plan => plan.id !== preferred.id) : available} canAssign={canAssign} saving={saving} error={error} onClose={closePicker} onSelect={plan => { void add(plan); }} /> : null}
    </View>
  </Page>;
}

function SchedulePlanPicker({ date, plans, canAssign, saving, error, onClose, onSelect }: {
  date: Date;
  plans: Plan[];
  canAssign: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSelect: (plan: Plan) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = plans.filter(plan => plan.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
      <View style={styles.modalHeading}>
        <View style={styles.entryContent}>
          <Text style={styles.modalTitle} accessibilityRole="header">安排训练计划</Text>
          <Text style={styles.muted}>{dateTitle(date)}</Text>
        </View>
        {!saving ? <IconButton icon="close" label="关闭计划选择" onPress={onClose} /> : <ActivityIndicator accessibilityLabel="正在保存安排" color={C.accent} />}
      </View>
      <View style={styles.search}>
        <Field value={query} onChangeText={setQuery} placeholder="搜索计划名称" />
        {error || !canAssign ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error || '请选择今天或之后的日期。'}</Text> : null}
      </View>
      <FlatList data={filtered} keyExtractor={plan => plan.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pickerList} ListEmptyComponent={<Empty icon="search-outline" title="没有找到可安排的计划" subtitle="试试其他关键词。" />} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`安排${item.name}`} accessibilityState={{ disabled: saving || !canAssign }} disabled={saving || !canAssign} onPress={() => onSelect(item)} style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}>
        <Text style={[styles.planName, styles.entryContent]}>{item.name}</Text>
        <Ionicons name="add-circle-outline" color={C.accent} size={23} />
      </Pressable>} />
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: 15, paddingTop: 10 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  todayButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  todayText: { color: C.accent, fontSize: 13, fontWeight: '800' },
  calendar: { gap: 11, paddingHorizontal: 8, paddingVertical: 10 },
  weekHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 3 },
  weekArrow: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { flex: 1, textAlign: 'center', color: C.text, fontSize: 14, fontWeight: '700' },
  days: { flexDirection: 'row', gap: 2 },
  day: { flex: 1, minWidth: 0, minHeight: 63, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 5 },
  dayToday: { borderColor: C.accent },
  daySelected: { backgroundColor: C.accent, borderColor: C.accent },
  dayLabel: { color: C.muted, fontSize: 11, textAlign: 'center' },
  dayNumber: { color: C.text, fontSize: 16, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  dayTextSelected: { color: C.bg },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotVisible: { backgroundColor: C.accent },
  dotSelected: { backgroundColor: C.bg },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  pressed: { opacity: 0.72 },
  dateHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  dateTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
  muted: { color: C.muted, fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 92, gap: 8, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 11 },
  entryIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' },
  entryContent: { flex: 1, gap: 4 },
  planName: { color: C.text, fontSize: 16, fontWeight: '800' },
  status: { color: C.muted, fontSize: 13, fontWeight: '700' },
  done: { color: C.accent },
  due: { color: C.orange },
  remove: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.danger, fontSize: 13, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: C.bg },
  modalHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.page },
  modalTitle: { color: C.text, fontSize: 22, fontWeight: '800' },
  search: { gap: 8, paddingHorizontal: space.page, paddingBottom: 10 },
  pickerList: { paddingHorizontal: space.page, paddingBottom: 20 },
  pickerRow: { minHeight: 57, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.line },
});
