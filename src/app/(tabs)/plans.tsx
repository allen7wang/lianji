import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/lib/data';
import { Badge, Button, Card, Header, IconButton, Page } from '@/ui/components';
import { templatePlanId, trainingPrograms, type TrainingProgram } from '@/lib/plan-templates';
import { PlanTemplatePreview } from '@/ui/plan-template-preview';
import { C } from '@/ui/theme';

export default function Plans() {
  const { plans, planItems, exercises, startWorkout, deletePlan } = useData();
  const [tab, setTab] = useState<'my' | 'templates'>('my');
  const [preview, setPreview] = useState<TrainingProgram | null>(null);
  async function begin(planId: string) {
    await startWorkout(planId);
    router.push('/workout');
  }
  function confirmDelete(planId: string, name: string) {
    Alert.alert('删除训练计划', `确定删除“${name}”？已完成的训练记录会保留。`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => { deletePlan(planId).catch(console.error); } },
    ]);
  }
  return <Page key={tab}>
    <Header eyebrow="YOUR PROGRAMS" title="训练计划" right={<IconButton icon="add" onPress={() => router.push('/plan-editor')} />} />
    <View style={{ flexDirection: 'row', gap: 10 }}><Badge label={`我的计划 ${plans.length}`} active={tab === 'my'} onPress={() => setTab('my')} /><Badge label="计划模板 · 4 套" active={tab === 'templates'} onPress={() => setTab('templates')} /></View>
    <Text style={styles.intro}>{tab === 'my' ? '按自己的节奏安排动作与组数，也可以从模板添加整套分化计划。' : '选择一种分化方式，查看每个训练日的动作，再添加到我的计划。'}</Text>
    {tab === 'templates' ? trainingPrograms.map(program => {
      const added = program.days.filter(day => plans.some(plan => plan.id === templatePlanId(program.id, day.id))).length;
      return <Card key={program.id} style={{ gap: 14 }}>
        <View style={styles.top}><View style={styles.index}><Text style={styles.indexText}>{program.days.length}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{program.name} · {program.subtitle}</Text><Text style={styles.note}>一轮 {program.days.length} 个训练日{added ? ` · 已添加 ${added}/${program.days.length}` : ''}</Text></View></View>
        <Text style={styles.note}>{program.description}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{program.days.map(day => <Badge key={day.id} label={day.name} />)}</View>
        <Button label={`查看${program.name}模板`} icon="list-outline" variant="secondary" onPress={() => setPreview(program)} />
      </Card>;
    }) : plans.map((plan, index) => {
      const items = planItems.filter(item => item.planId === plan.id);
      return <Card key={plan.id} style={{ gap: 16 }}>
        <View style={styles.top}><View style={styles.index}><Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{plan.name}</Text><Text style={styles.note}>{plan.note || `${items.length} 个动作`}</Text></View><Pressable onPress={() => router.push({ pathname: '/plan-editor', params: { id: plan.id } })} hitSlop={10}><Ionicons name="create-outline" color={C.muted} size={21} /></Pressable></View>
        <View style={styles.divider} />
        <View style={{ gap: 10 }}>{items.slice(0, 5).map((item, i) => <View key={item.id} style={styles.exerciseRow}><Text style={styles.exerciseNumber}>{i + 1}</Text><Text style={styles.exerciseName}>{exercises.find(ex => ex.id === item.exerciseId)?.name ?? '未知动作'}</Text><Text style={styles.exerciseSets}>{item.sets} × {item.reps}</Text></View>)}{items.length > 5 ? <Text style={styles.more}>还有 {items.length - 5} 个动作</Text> : null}</View>
        <View style={styles.actions}><Button label="开始训练" icon="play" onPress={() => begin(plan.id)} style={{ flex: 1 }} /><IconButton icon="trash-outline" color={C.faint} onPress={() => confirmDelete(plan.id, plan.name)} /></View>
      </Card>;
    })}
    {tab === 'my' ? <Button label="创建新计划" icon="add" variant="secondary" onPress={() => router.push('/plan-editor')} /> : null}
    {preview ? <PlanTemplatePreview program={preview} onClose={() => setPreview(null)} onImported={() => { setPreview(null); setTab('my'); }} /> : null}
  </Page>;
}

const styles = StyleSheet.create({
  intro: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: -6 }, top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  index: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.accentDark, alignItems: 'center', justifyContent: 'center' }, indexText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  name: { color: C.text, fontSize: 17, fontWeight: '700' }, note: { color: C.muted, fontSize: 12, marginTop: 5 }, divider: { height: 1, backgroundColor: C.line },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, exerciseNumber: { color: C.faint, fontSize: 12, width: 16 }, exerciseName: { color: C.text, fontSize: 13, flex: 1 }, exerciseSets: { color: C.muted, fontSize: 12 }, more: { color: C.faint, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
