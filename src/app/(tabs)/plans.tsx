import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { prioritizePlans } from '@/lib/plan-library';
import { Badge, Button, Card, Empty, Header, IconButton, Page } from '@/ui/components';
import { programCategories, programSports, templatePlanId, trainingPrograms, type TrainingProgram } from '@/lib/plan-templates';
import { targetLabel } from '@/lib/types';
import { PlanTemplatePreview } from '@/ui/plan-template-preview';
import { C } from '@/ui/theme';

export default function Plans() {
  const { plans, planItems, exercises, workouts, schedule, favoritePlanIds, setPlanFavorite, startWorkout, deleteWorkout, deletePlan } = useData();
  const [tab, setTab] = useState<'my' | 'templates'>('my');
  const [planFilter, setPlanFilter] = useState<'all' | 'favorites'>('all');
  const [favoriteSaving, setFavoriteSaving] = useState<Set<string>>(() => new Set());
  const [favoriteError, setFavoriteError] = useState('');
  const favoritesInFlight = useRef(new Set<string>());
  const [preview, setPreview] = useState<TrainingProgram | null>(null);
  const [category, setCategory] = useState('全部');
  const [sport, setSport] = useState('全部项目');
  const favorites = useMemo(() => new Set(favoritePlanIds), [favoritePlanIds]);
  const sortedPlans = useMemo(() => prioritizePlans(plans, favoritePlanIds), [plans, favoritePlanIds]);
  const favoritePlans = sortedPlans.filter(plan => favorites.has(plan.id));
  const shownPlans = planFilter === 'favorites' ? favoritePlans : sortedPlans;

  async function toggleFavorite(planId: string) {
    if (favoritesInFlight.current.has(planId)) return;
    favoritesInFlight.current.add(planId);
    setFavoriteSaving(current => new Set(current).add(planId));
    setFavoriteError('');
    try {
      await setPlanFavorite(planId, !favorites.has(planId));
    } catch {
      setFavoriteError('更新常用计划失败，请重试。');
    } finally {
      favoritesInFlight.current.delete(planId);
      setFavoriteSaving(current => {
        const next = new Set(current);
        next.delete(planId);
        return next;
      });
    }
  }
  async function begin(planId: string, name: string) {
    const conflict = workouts.find(item => !item.endedAt && item.planId !== planId);
    if (!conflict) {
      await startWorkout(planId);
      router.push('/workout');
      return;
    }
    Alert.alert('有进行中的训练', `「${conflict.name}」尚未结束。开始「${name}」需要先放弃它，其中已记录的组数不会保存。`, [
      { text: '取消', style: 'cancel' },
      { text: `继续「${conflict.name}」`, onPress: () => router.push('/workout') },
      { text: '放弃并开始', style: 'destructive', onPress: () => { (async () => { await deleteWorkout(conflict.id); await startWorkout(planId); router.push('/workout'); })().catch(console.error); } },
    ]);
  }
  function confirmDelete(planId: string, name: string) {
    const linked = schedule.some(entry => entry.planId === planId);
    Alert.alert('删除训练计划', `确定删除「${name}」${linked ? '和关联的训练安排' : ''}？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { deletePlan(planId).catch(console.error); } },
    ]);
  }
  return <Page key={tab}>
    <Header eyebrow="YOUR PROGRAMS" title="训练计划" right={<View style={styles.actions}>
      <IconButton icon="calendar-outline" label="训练安排" onPress={() => router.push('/training-schedule')} />
      <IconButton icon="add" label="创建计划" onPress={() => router.push('/plan-editor')} />
    </View>} />
    <View style={{ flexDirection: 'row', gap: 10 }}><Badge label={`我的计划 ${plans.length}`} active={tab === 'my'} onPress={() => setTab('my')} /><Badge label={`计划模板 · ${trainingPrograms.length} 套`} active={tab === 'templates'} onPress={() => setTab('templates')} /></View>
    <Text style={styles.intro}>{tab === 'my' ? '按自己的节奏安排动作与组数，也可以从模板添加整套计划。' : '按场景挑选计划，查看器材、频率和动作，再添加到我的计划。'}</Text>
    {tab === 'my' ? <>
      <View style={styles.filters}>
        {([{ value: 'all', label: '全部', count: plans.length }, { value: 'favorites', label: '常用', count: favoritePlans.length }] as const).map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={`${option.label}计划，${option.count} 个`} accessibilityState={{ selected: planFilter === option.value }} onPress={() => setPlanFilter(option.value)} style={[styles.filter, planFilter === option.value && styles.filterActive]}>
          <Text style={[styles.filterText, planFilter === option.value && styles.filterTextActive]}>{option.label} {option.count}</Text>
        </Pressable>)}
      </View>
      {favoriteError ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.favoriteError}>{favoriteError}</Text> : null}
      {planFilter === 'favorites' && !shownPlans.length ? <>
        <Empty icon="star-outline" title="还没有常用计划" subtitle="在全部计划中点亮星标，常用计划会优先显示在首页。" />
        <Button label="查看全部计划" variant="secondary" onPress={() => setPlanFilter('all')} />
      </> : null}
    </> : null}
    {tab === 'templates' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{programCategories.map(value => <Badge key={value} label={value} active={category === value} onPress={() => { setCategory(value); setSport('全部项目'); }} />)}</View> : null}
    {tab === 'templates' && category === '专项力量' ? <View style={{ gap: 8 }}><Text style={styles.note}>选择运动项目</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{programSports.map(value => <Badge key={value} label={value} active={sport === value} onPress={() => setSport(value)} />)}</View></View> : null}
    {tab === 'templates' ? trainingPrograms.filter(program => (category === '全部' || program.category === category) && (category !== '专项力量' || sport === '全部项目' || program.sport === sport)).map(program => {
      const added = program.days.filter(day => plans.some(plan => plan.id === templatePlanId(program.id, day.id))).length;
      return <Card key={program.id} style={{ gap: 14 }}>
        <View style={styles.top}><View style={styles.index}><Text style={styles.indexText}>{program.days.length}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{program.name} · {program.subtitle}</Text><Text style={styles.note}>一轮 {program.days.length} 个训练日{added ? ` · 已添加 ${added}/${program.days.length}` : ''}</Text></View></View>
        <Text style={styles.note}>{program.description}</Text>
        <Text style={styles.note}>{program.level} · {program.equipment.join(' / ')}</Text>
        <Text style={styles.note}>{program.frequency}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{program.days.map(day => <Badge key={day.id} label={day.name} />)}</View>
        <Button label={`查看${program.name}模板`} icon="list-outline" variant="secondary" onPress={() => setPreview(program)} />
      </Card>;
    }) : shownPlans.map((plan, index) => {
      const items = planItems.filter(item => item.planId === plan.id);
      const favorite = favorites.has(plan.id);
      const savingFavorite = favoriteSaving.has(plan.id);
      return <Card key={plan.id} style={{ gap: 16 }}>
        <View style={styles.top}>
          <View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.name}>{plan.name}</Text><Text style={styles.note}>{plan.note || `${items.length} 个动作`}</Text></View>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`${plan.name}，常用计划`} accessibilityHint="切换常用标记" accessibilityState={{ checked: favorite, disabled: savingFavorite, busy: savingFavorite }} disabled={savingFavorite} onPress={() => { void toggleFavorite(plan.id); }} style={[styles.favorite, favorite && styles.favoriteActive]}>
            {savingFavorite ? <ActivityIndicator color={C.accent} size="small" /> : <Ionicons name={favorite ? 'star' : 'star-outline'} color={favorite ? C.accent : C.muted} size={22} />}
          </Pressable>
        </View>
        <View style={styles.divider} />
        <View style={{ gap: 10 }}>{items.slice(0, 5).map((item, i) => <View key={item.id} style={styles.exerciseRow}><Text style={styles.exerciseNumber}>{i + 1}</Text><Text style={styles.exerciseName}>{exercises.find(ex => ex.id === item.exerciseId)?.name ?? '未知动作'}</Text><Text style={styles.exerciseSets}>{item.sets} × {targetLabel(item.reps, item.unit)}</Text></View>)}{items.length > 5 ? <Text style={styles.more}>还有 {items.length - 5} 个动作</Text> : null}</View>
        <View style={styles.secondaryActions}>
          <Button label="编辑计划" icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/plan-editor', params: { id: plan.id } })} style={styles.planAction} />
          <Button label="复制计划" icon="copy-outline" variant="secondary" onPress={() => router.push({ pathname: '/plan-editor', params: { copyPlanId: plan.id } })} style={styles.planAction} />
        </View>
        <View style={styles.actions}>
          <Button label="开始训练" icon="play" onPress={() => begin(plan.id, plan.name)} style={styles.planAction} />
          <IconButton icon="calendar-outline" label={`安排${plan.name}的日期`} onPress={() => router.push({ pathname: '/training-schedule', params: { planId: plan.id } })} />
          <IconButton icon="trash-outline" label={`删除${plan.name}`} color={C.faint} onPress={() => confirmDelete(plan.id, plan.name)} />
        </View>
      </Card>;
    })}
    {tab === 'my' ? <Button label="创建新计划" icon="add" variant="secondary" onPress={() => router.push('/plan-editor')} /> : null}
    {preview ? <PlanTemplatePreview program={preview} onClose={() => setPreview(null)} onImported={() => { setPreview(null); setPlanFilter('all'); setTab('my'); }} /> : null}
  </Page>;
}

const styles = StyleSheet.create({
  intro: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: -6 }, top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  index: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, indexText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  name: { color: C.text, fontSize: 17, fontWeight: '700' }, note: { color: C.muted, fontSize: 12, marginTop: 5 }, divider: { height: 1, backgroundColor: C.line },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, exerciseNumber: { color: C.faint, fontSize: 12, width: 16 }, exerciseName: { color: C.text, fontSize: 13, flex: 1 }, exerciseSets: { color: C.muted, fontSize: 12 }, more: { color: C.faint, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  secondaryActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planAction: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 17, justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.elevated },
  filterActive: { backgroundColor: C.accent, borderColor: C.accent },
  filterText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: C.bg },
  favorite: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.elevated, justifyContent: 'center', alignItems: 'center' },
  favoriteActive: { backgroundColor: C.accentDark },
  favoriteError: { color: C.danger, fontSize: 13, lineHeight: 18 },
});
