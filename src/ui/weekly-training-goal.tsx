import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import type { WeeklyTrainingActivity } from '@/lib/training-progress';
import { Button, Card, IconButton } from './components';
import { C, space } from './theme';

const goalOptions = [1, 2, 3, 4, 5, 6, 7];

export function WeeklyTrainingGoal({ weeks, showRecent = false }: { weeks: WeeklyTrainingActivity[]; showRecent?: boolean }) {
  const { ready, weeklyGoal, setWeeklyGoal } = useData();
  const [editing, setEditing] = useState(false);
  if (!ready) return <Card style={styles.loading}>
    <ActivityIndicator color={C.accent} />
    <Text style={styles.detail}>正在加载本周目标</Text>
  </Card>;
  const week = weeks[0];
  if (!week) return null;
  const remaining = Math.max(weeklyGoal - week.count, 0);
  const reached = weeklyGoal > 0 && remaining === 0;
  const status = reached ? '本周已达标' : `还差 ${remaining} 天`;
  const actionLabel = weeklyGoal ? '调整目标' : '设定目标';

  return <Card style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.labelRow}>
        <Ionicons name={reached ? 'checkmark-circle' : 'flag-outline'} size={20} color={C.accent} />
        <Text accessibilityRole="header" style={styles.title}>本周训练目标</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={() => setEditing(true)} style={({ pressed }) => [styles.editAction, pressed && styles.pressed]}>
        <Text style={styles.editText}>{actionLabel}</Text>
        <Ionicons name="chevron-forward" size={15} color={C.accent} />
      </Pressable>
    </View>
    {weeklyGoal ? <>
      <View style={styles.summary}>
        <Text style={styles.count}>{week.count}<Text style={styles.target}> / {weeklyGoal} 天</Text></Text>
        <Text style={[styles.status, reached && styles.reached]}>{status}</Text>
      </View>
      <View accessible accessibilityRole="progressbar" accessibilityLabel="本周训练目标进度" accessibilityValue={{ min: 0, max: weeklyGoal, now: Math.min(week.count, weeklyGoal), text: `已训练 ${week.count} 天，目标 ${weeklyGoal} 天，${status}` }} style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(1, week.count / weeklyGoal) * 100}%` }]} />
      </View>
    </> : <Text style={styles.detail}>已训练 {week.count} 天 · 设定每周要练几天</Text>}
    {showRecent ? <RecentTrainingWeeks weeks={weeks} /> : null}
    {editing ? <GoalEditor initial={weeklyGoal} onSave={setWeeklyGoal} onClose={() => setEditing(false)} /> : null}
  </Card>;
}

function RecentTrainingWeeks({ weeks }: { weeks: WeeklyTrainingActivity[] }) {
  return <View style={styles.recent}>
    <Text style={styles.detail} accessibilityRole="header">近 {weeks.length} 周训练天数</Text>
    <View style={styles.weekRow}>
      {weeks.map((week, index) => {
        const current = index === 0;
        const start = `${week.start.getMonth() + 1}/${week.start.getDate()}`;
        return <View key={week.start.getTime()} accessible accessibilityLabel={`${current ? '本周' : `${week.start.getMonth() + 1}月${week.start.getDate()}日起的一周`}训练 ${week.count} 天`} style={[styles.week, current && styles.currentWeek]}>
          <Text style={styles.weekLabel}>{current ? '本周' : `${start} 起`}</Text>
          <Text style={[styles.weekCount, current && styles.currentWeekCount]}>{week.count} 天</Text>
        </View>;
      }).reverse()}
    </View>
  </View>;
}

function GoalEditor({ initial, onSave, onClose }: { initial: number; onSave: (days: number) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const close = () => { if (!pending.current) onClose(); };

  function select(days: number) {
    setDraft(days);
    setError(false);
  }

  async function save() {
    if (pending.current || draft === initial) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      await onSave(draft);
      onClose();
    } catch {
      setError(true);
      setSaving(false);
    } finally {
      pending.current = false;
    }
  }

  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} accessibilityRole="header">每周训练目标</Text>
          {!saving ? <IconButton icon="close" label="关闭目标设置" onPress={close} /> : null}
        </View>
        <Text style={styles.detail}>一周从周一开始。训练至少完成一组并保存后计入，同一天最多计 1 天。</Text>
        <Text style={styles.title}>每周计划训练几天？</Text>
        <View style={styles.choices}>
          {goalOptions.map(days => {
            const checked = draft === days;
            return <Pressable key={days} accessibilityRole="radio" accessibilityLabel={`每周 ${days} 天`} accessibilityState={{ checked, disabled: saving }} disabled={saving} onPress={() => select(days)} style={({ pressed }) => [styles.choice, checked && styles.choiceChecked, pressed && styles.pressed]}>
              <Text style={[styles.choiceText, checked && styles.choiceTextChecked]}>{days} 天</Text>
            </Pressable>;
          })}
        </View>
        <Pressable accessibilityRole="radio" accessibilityLabel="关闭目标" accessibilityState={{ checked: draft === 0, disabled: saving }} disabled={saving} onPress={() => select(0)} style={({ pressed }) => [styles.off, draft === 0 && styles.choiceChecked, pressed && styles.pressed]}>
          <Ionicons name={draft === 0 ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={draft === 0 ? C.accent : C.muted} />
          <Text style={[styles.choiceText, draft === 0 && styles.choiceTextChecked]}>关闭目标</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.modalFooter}>
        {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>保存目标失败，请重试。</Text> : null}
        <Button label={saving ? '正在保存…' : '保存目标'} icon="checkmark" disabled={saving || draft === initial} onPress={save} />
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  card: { gap: 6, paddingVertical: 12 },
  loading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { color: C.text, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  editAction: { flexDirection: 'row', gap: 3, minHeight: 44, alignItems: 'center' },
  editText: { color: C.accent, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  summary: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  count: { color: C.accent, fontSize: 25, fontWeight: '800', fontVariant: ['tabular-nums'] },
  target: { color: C.text, fontSize: 15, fontWeight: '700' },
  status: { color: C.muted, fontSize: 13, fontWeight: '700' },
  reached: { color: C.accent },
  track: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: C.line },
  fill: { height: 7, borderRadius: 4, backgroundColor: C.accent },
  detail: { color: C.muted, fontSize: 13, lineHeight: 19 },
  recent: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 6, paddingTop: 9, gap: 8 },
  weekRow: { flexDirection: 'row', gap: 5 },
  week: { flex: 1, minWidth: 0, gap: 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 7, borderRadius: 11, backgroundColor: C.elevated },
  currentWeek: { backgroundColor: C.accentDark },
  weekLabel: { color: C.muted, fontSize: 11, textAlign: 'center' },
  weekCount: { color: C.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  currentWeekCount: { color: C.accent },
  modal: { flex: 1, backgroundColor: C.bg },
  modalContent: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 17, paddingHorizontal: space.page, paddingVertical: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 8 },
  modalTitle: { color: C.text, fontSize: 23, fontWeight: '800', flexShrink: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minWidth: 60, minHeight: 47, borderRadius: 13, paddingHorizontal: 9, paddingVertical: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated, borderWidth: 1, borderColor: C.line },
  choiceChecked: { backgroundColor: C.accentDark, borderColor: C.accent },
  choiceText: { color: C.text, fontSize: 15, fontWeight: '700' },
  choiceTextChecked: { color: C.accent },
  off: { minHeight: 47, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.elevated, flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalFooter: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 8, paddingHorizontal: space.page, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.line },
  error: { color: C.danger, fontSize: 13, fontWeight: '700' },
});
