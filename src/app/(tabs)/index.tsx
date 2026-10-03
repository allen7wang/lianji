import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { dateLabel, durationLabel, volumeOf } from '@/lib/types';
import { Button, Card, Header, Metric, Page, SectionTitle } from '@/ui/components';
import { C } from '@/ui/theme';

export default function Today() {
  const { ready, plans, planItems, exercises, workouts, workoutSets, startWorkout } = useData();
  const active = workouts.find(item => !item.endedAt);
  const finished = workouts.filter(item => item.endedAt);
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekWorkouts = finished.filter(item => new Date(item.startedAt) >= monday);
  const weekVolume = weekWorkouts.reduce((sum, workout) => sum + volumeOf(workoutSets.filter(set => set.workoutId === workout.id)), 0);
  const daily = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    return finished.filter(item => new Date(item.startedAt).toDateString() === day.toDateString()).length;
  });
  const now = new Date();

  async function begin(planId?: string) {
    await startWorkout(planId);
    router.push('/workout');
  }

  return <Page>
    <Header eyebrow="LIANJI · TRAINING LOG" title="今天练什么？" right={<View style={styles.date}><Text style={styles.dateDay}>{now.getDate()}</Text><Text style={styles.dateMonth}>{now.getMonth() + 1}月</Text></View>} />
    <View style={styles.hero}>
      <View style={styles.orb} />
      <View style={styles.heroContent}>
        <View style={styles.heroTag}><Ionicons name="flash" color={C.bg} size={13} /><Text style={styles.heroTagText}>专注每一次进步</Text></View>
        <Text style={styles.heroTitle}>{active ? '继续你的训练' : '把今天练成\n更强的一天'}</Text>
        <Text style={styles.heroSub}>{active ? `${active.name} · ${durationLabel(active.startedAt, null)}` : '自由记录每一组重量、次数和感受。'}</Text>
        <Button label={active ? '继续记录' : '开始自由训练'} icon="arrow-forward" onPress={() => active ? router.push('/workout') : begin()} style={{ alignSelf: 'flex-start', marginTop: 22 }} />
      </View>
    </View>
    <Pressable onPress={() => router.push('/nutrition')} style={styles.nutrition}><View style={styles.nutritionIcon}><Ionicons name="nutrition-outline" size={21} color={C.accent} /></View><View style={{ flex: 1 }}><Text style={styles.nutritionTitle}>记录今日饮食</Text><Text style={styles.nutritionSub}>热量 · 蛋白质 · 碳水 · 脂肪</Text></View><Ionicons name="chevron-forward" size={18} color={C.faint} /></Pressable>
    <SectionTitle title="本周概览" action="查看统计" onAction={() => router.push('/history')} />
    <Card><View style={styles.metricRow}><Metric value={`${weekWorkouts.length}`} label="训练次数" accent /><Metric value={`${Math.round(weekVolume).toLocaleString()}`} label="训练容量 · kg" /></View><View style={styles.bars}>{daily.map((count, i) => <View key={i} style={styles.barColumn}><View style={[styles.bar, { height: Math.max(6, Math.min(50, count * 25)), backgroundColor: count ? C.accent : C.line }]} /><Text style={styles.barLabel}>{'一二三四五六日'[i]}</Text></View>)}</View></Card>
    <SectionTitle title="我的训练计划" action="全部计划" onAction={() => router.push('/plans')} />
    {plans.slice(0, 3).map((plan, index) => {
      const items = planItems.filter(item => item.planId === plan.id);
      const first = items.slice(0, 3).map(item => exercises.find(ex => ex.id === item.exerciseId)?.name).filter(Boolean).join(' · ');
      return <Pressable key={plan.id} style={styles.plan} onPress={() => begin(plan.id)}><View style={styles.planNumber}><Text style={styles.planNumberText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={styles.planTitle}>{plan.name}</Text><Text style={styles.planSub} numberOfLines={1}>{items.length} 个动作 · {first}</Text></View><Ionicons name="arrow-forward-circle" color={C.accent} size={26} /></Pressable>;
    })}
    {finished[0] ? <><SectionTitle title="上次训练" action="全部历史" onAction={() => router.push('/history')} /><Pressable onPress={() => router.push({ pathname: '/history/[id]', params: { id: finished[0].id } })}><Card style={styles.recent}><View><Text style={styles.recentTitle}>{finished[0].name}</Text><Text style={styles.recentSub}>{dateLabel(finished[0].startedAt)} · {durationLabel(finished[0].startedAt, finished[0].endedAt)}</Text></View><Ionicons name="chevron-forward" size={20} color={C.muted} /></Card></Pressable></> : null}
    {!ready ? <Text style={{ color: C.muted }}>正在加载训练数据…</Text> : null}
  </Page>;
}

const styles = StyleSheet.create({
  date: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  dateDay: { color: C.text, fontSize: 18, fontWeight: '800', lineHeight: 20 }, dateMonth: { color: C.muted, fontSize: 10 },
  hero: { overflow: 'hidden', minHeight: 260, borderRadius: 26, backgroundColor: '#263E1B', marginTop: 6 },
  orb: { width: 250, height: 250, borderRadius: 125, backgroundColor: '#517C2D', position: 'absolute', right: -80, top: -100, opacity: 0.6 },
  heroContent: { padding: 24, flex: 1, justifyContent: 'center' },
  heroTag: { alignSelf: 'flex-start', backgroundColor: C.accent, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }, heroTagText: { fontSize: 10, fontWeight: '800', color: C.bg },
  heroTitle: { color: C.text, fontSize: 30, lineHeight: 38, fontWeight: '800', marginTop: 18 }, heroSub: { color: '#C4D3BD', fontSize: 13, marginTop: 8 },
  metricRow: { flexDirection: 'row' }, bars: { marginTop: 22, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 73 },
  barColumn: { alignItems: 'center', gap: 6, width: 24 }, bar: { width: 16, borderRadius: 8 }, barLabel: { color: C.faint, fontSize: 11 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 15 },
  planNumber: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' }, planNumberText: { color: C.accent, fontSize: 14, fontWeight: '800' }, planTitle: { color: C.text, fontSize: 16, fontWeight: '700' }, planSub: { color: C.muted, fontSize: 11, marginTop: 5 },
  recent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, recentTitle: { color: C.text, fontSize: 16, fontWeight: '700' }, recentSub: { color: C.muted, marginTop: 5, fontSize: 12 },
  nutrition: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderRadius: 17, backgroundColor: C.surface, borderColor: C.line, borderWidth: 1 }, nutritionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, nutritionTitle: { color: C.text, fontWeight: '700', fontSize: 14 }, nutritionSub: { color: C.muted, fontSize: 11, marginTop: 4 },
});
