import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useActions, useLibrary } from '@/lib/data';
import type { WeeklyTrainingActivity } from '@/lib/training-progress';
import { Button, Card, ProgressTrack, Sheet, Tag, Txt } from './components';
import { makeStyles, radius, space, useTheme } from './theme';

const goalOptions = [1, 2, 3, 4, 5, 6, 7];
const weekdays = '一二三四五六日';

export function WeeklyTrainingGoal({ weeks, showRecent = false, children }: { weeks: WeeklyTrainingActivity[]; showRecent?: boolean; children?: React.ReactNode }) {
  const { ready, weeklyGoal } = useLibrary();
  const { setWeeklyGoal } = useActions();
  const s = useStyles();
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  if (!ready) return <Card style={s.loading}><ActivityIndicator color={c.accent} /><Txt variant="caption" tone="muted">正在加载本周目标</Txt></Card>;
  const week = weeks[0];
  if (!week) return null;
  const remaining = Math.max(weeklyGoal - week.count, 0);
  const reached = weeklyGoal > 0 && remaining === 0;
  const actionLabel = weeklyGoal ? '调整目标' : '设定目标';

  return <Card style={s.card}>
    <View style={s.top}>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="overline" tone="muted">本周训练</Txt>
        <Txt variant="display" style={s.count}>{week.count}<Txt variant="title3" tone="muted">{weeklyGoal ? ` / ${weeklyGoal} 天` : ' 天'}</Txt></Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: space.sm }}>
        {weeklyGoal ? <Tag label={reached ? '本周已达标' : `还差 ${remaining} 天`} tone={reached ? 'success' : 'accent'} icon={reached ? 'checkmark' : 'flag'} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={10} onPress={() => setEditing(true)} style={({ pressed }) => [s.action, pressed && { opacity: 0.6 }]}>
          <Txt variant="bodyStrong" tone="accent" style={{ fontSize: 14 }}>{actionLabel}</Txt>
          <Ionicons name="chevron-forward" size={14} color={c.accentText} />
        </Pressable>
      </View>
    </View>
    {weeklyGoal ? <ProgressTrack value={week.count / weeklyGoal} tone={reached ? 'success' : 'accent'} /> : null}
    <View style={s.days} accessible accessibilityLabel={`本周已训练 ${week.count} 天：${week.days.filter(day => day.trained).map(day => `周${weekdays[(day.date.getDay() + 6) % 7]}`).join('、') || '还没有训练'}`}>
      {week.days.map((day, index) => {
        const future = !day.trained && !day.today && day.date > new Date();
        return <View key={day.key} style={s.day}>
          <View style={[s.dot, day.trained && s.dotTrained, day.today && !day.trained && s.dotToday, future && s.dotFuture]}>
            {day.trained ? <Ionicons name="checkmark" size={15} color={c.onInverse} /> : <Txt variant="caption" tone={day.today ? 'accent' : 'faint'} style={{ fontWeight: '700' }}>{day.date.getDate()}</Txt>}
          </View>
          <Txt variant="caption" tone={day.today ? 'default' : 'faint'} style={{ fontSize: 11, fontWeight: day.today ? '800' : '600' }}>{weekdays[index]}</Txt>
        </View>;
      })}
    </View>
    {children}
    {showRecent ? <RecentTrainingWeeks weeks={weeks} goal={weeklyGoal} /> : null}
    {editing ? <GoalEditor initial={weeklyGoal} onSave={setWeeklyGoal} onClose={() => setEditing(false)} /> : null}
  </Card>;
}

function RecentTrainingWeeks({ weeks, goal }: { weeks: WeeklyTrainingActivity[]; goal: number }) {
  const s = useStyles();
  const { c } = useTheme();
  const max = Math.max(7, goal);
  return <View style={s.recent}>
    <Txt variant="caption" tone="muted" accessibilityRole="header">近 {weeks.length} 周训练天数</Txt>
    <View style={s.weekRow}>
      {[...weeks].reverse().map((week, index, list) => {
        const current = index === list.length - 1;
        const label = current ? '本周' : `${week.start.getMonth() + 1}/${week.start.getDate()}`;
        const met = goal > 0 && week.count >= goal;
        return <View key={week.start.getTime()} accessible accessibilityLabel={`${current ? '本周' : `${week.start.getMonth() + 1}月${week.start.getDate()}日起的一周`}训练 ${week.count} 天`} style={s.weekColumn}>
          <Txt variant="caption" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>{week.count}</Txt>
          <View style={s.barTrack}>
            <View style={[s.bar, { height: `${Math.max(6, (week.count / max) * 100)}%`, backgroundColor: week.count ? met ? c.success : current ? c.accent : c.data : c.surfaceAlt }]} />
          </View>
          <Txt variant="caption" tone={current ? 'default' : 'faint'} style={{ fontSize: 11 }}>{label}</Txt>
        </View>;
      })}
    </View>
  </View>;
}

function GoalEditor({ initial, onSave, onClose }: { initial: number; onSave: (days: number) => Promise<void>; onClose: () => void }) {
  const s = useStyles();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);

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

  return <Sheet visible title="每周训练目标" subtitle="一周从周一开始；保存一场含完成组的训练计 1 天" onClose={() => { if (!pending.current) onClose(); }} closeDisabled={saving}
    footer={<View style={{ gap: space.sm }}>
      {error ? <Txt variant="caption" tone="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">保存目标失败，请重试。</Txt> : null}
      <Button label={saving ? '正在保存…' : '保存目标'} icon="checkmark" loading={saving} disabled={draft === initial} onPress={save} />
    </View>}>
    <Txt variant="title3">每周计划训练几天？</Txt>
    <View style={s.choices}>
      {goalOptions.map(days => {
        const checked = draft === days;
        return <Pressable key={days} accessibilityRole="radio" accessibilityLabel={`每周 ${days} 天`} accessibilityState={{ checked, disabled: saving }} disabled={saving} onPress={() => { setDraft(days); setError(false); }} style={({ pressed }) => [s.choice, checked && s.choiceChecked, pressed && { opacity: 0.7 }]}>
          <Txt variant="number" tone={checked ? 'inverse' : 'default'}>{days}</Txt>
          <Txt variant="caption" tone={checked ? 'inverse' : 'muted'}>天</Txt>
        </Pressable>;
      })}
    </View>
    <Button label="关闭每周目标" variant={draft === 0 ? 'inverse' : 'secondary'} icon={draft === 0 ? 'checkmark-circle' : 'ellipse-outline'} disabled={saving} onPress={() => { setDraft(0); setError(false); }} />
  </Sheet>;
}

const useStyles = makeStyles(c => ({
  card: { gap: space.lg },
  loading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  count: { marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 28 },
  days: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 6, flex: 1 },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
  dotTrained: { backgroundColor: c.inverse, borderColor: c.inverse },
  dotToday: { borderColor: c.accent, borderWidth: 2 },
  dotFuture: { backgroundColor: c.surfaceAlt, borderColor: c.surfaceAlt },
  recent: { gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.lg },
  weekRow: { flexDirection: 'row', gap: space.md },
  weekColumn: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { height: 64, width: '100%', maxWidth: 36, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  choice: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  choiceChecked: { backgroundColor: c.inverse },
}));
