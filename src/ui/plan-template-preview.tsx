import { useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '@/lib/data';
import { templatePlanId, type TrainingProgram } from '@/lib/plan-templates';
import { Button, Card, IconButton } from './components';
import { C } from './theme';

export function PlanTemplatePreview({ program, onClose, onImported }: {
  program: TrainingProgram; onClose: () => void; onImported: () => void;
}) {
  const { ready, plans, addProgramTemplate } = useData();
  const [busy, setBusy] = useState(false);
  const missing = program.days.filter(day => !plans.some(plan => plan.id === templatePlanId(program.id, day.id))).length;
  const close = () => { if (!busy) onClose(); };
  async function add() {
    if (busy || !ready || !missing) return;
    setBusy(true);
    try {
      await addProgramTemplate(program.id);
      onImported();
    } catch (error) {
      Alert.alert('添加失败', error instanceof Error ? error.message : '请稍后重试。');
    } finally {
      setBusy(false);
    }
  }
  return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>计划模板</Text><Text style={styles.title}>{program.name} · {program.subtitle}</Text></View><IconButton icon="close" onPress={close} /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>{program.description}</Text>
        <View style={{ gap: 6 }}><Text style={styles.hint}>{program.category} · {program.level}</Text><Text style={styles.hint}>器材：{program.equipment.join(' / ')}</Text><Text style={styles.hint}>{program.frequency}</Text></View>
        <Text style={styles.hint}>一轮包含 {program.days.length} 个训练日，可在训练日之间安排休息。添加后可修改动作、组数、次数和重量。</Text>
        {program.days.map((day, index) => <Card key={day.id} style={{ gap: 12 }}>
          <Text style={styles.day}>{index + 1} · {day.name}</Text><Text style={styles.focus}>{day.focus}</Text>
          {day.exercises.map(item => <View key={item.name} style={styles.row}><Text style={styles.exercise}>{item.name}</Text><Text style={styles.sets}>{item.sets} 组 × {item.reps} 次</Text></View>)}
          <Text style={styles.total}>{day.exercises.length} 个动作 · {day.exercises.reduce((sum, item) => sum + item.sets, 0)} 组</Text>
        </Card>)}
        <Text style={styles.hint}>目标重量初始为 0 kg，请在计划编辑或训练时填写实际重量。已添加的训练日会保留你的修改。</Text>
        {program.guidance.map(tip => <Text key={tip} style={styles.hint}>• {tip}</Text>)}
      </ScrollView>
      <View style={styles.footer}><Button label={busy ? '正在添加…' : !missing ? '已添加到我的计划' : missing < program.days.length ? `补齐 ${missing} 个训练日` : `添加整套计划 · ${missing} 个训练日`} disabled={busy || !ready || !missing} icon="add-circle-outline" onPress={add} /></View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: 20 }, eyebrow: { color: C.accent, fontSize: 11, fontWeight: '700', marginBottom: 7 }, title: { color: C.text, fontSize: 19, fontWeight: '800', maxWidth: 280 },
  content: { padding: 20, paddingTop: 0, gap: 18 }, description: { color: C.text, fontSize: 15, lineHeight: 23 }, hint: { color: C.muted, fontSize: 12, lineHeight: 20 }, day: { color: C.accent, fontSize: 18, fontWeight: '800' }, focus: { color: C.muted, fontSize: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, exercise: { flex: 1, color: C.text, fontSize: 14 }, sets: { color: C.muted, fontSize: 12 }, total: { color: C.faint, fontSize: 11, marginTop: 3 }, footer: { padding: 20, borderTopWidth: 1, borderTopColor: C.line },
});
